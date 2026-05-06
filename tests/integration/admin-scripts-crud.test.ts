import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：管理端话术 CRUD 端到端生命周期串联（unit25）
 *
 * 注意：unit20/21/22 的边界用例（zod / 鉴权 / 跨租户 / 状态机非法跳转 / DB 异常）
 * 已分别由 admin-scripts-list-create / admin-scripts-update-delete /
 * admin-scripts-archive 三套集成测试覆盖。本文件只负责「串联生命周期」：
 *
 *   POST create(draft)
 *   → GET list（包含新建，status=draft）
 *   → PUT update（改 title / 标签）
 *   → POST 直接发布 published 的另一条
 *   → POST .../archive（published → archived）
 *   → GET list 检查 archived
 *   → DELETE（软删）→ 404
 *
 * 用 module-level in-memory store 充当整套 service 的「mock 数据库」，
 * 让 list/create/update/archive/softDelete 之间共享状态，实现真实串联。
 */

// ----------------------------------------------------------------------------
// In-memory store（与服务层 mock 共享）
// ----------------------------------------------------------------------------

const {
  mockManager,
  resetStore,
  ScriptStateTransitionError,
  mockListScripts,
  mockCreateScript,
  mockUpdateScript,
  mockArchiveScript,
  mockSoftDeleteScript,
} = vi.hoisted(() => {
  const mockManager = {
    id: "user-mgr-1",
    name: "主管",
    email: "mgr@example.com",
    role: "manager",
    tenantId: "tenant-1",
  };

  // 业务异常类（与 archive route `instanceof` 对齐）
  class ScriptStateTransitionError extends Error {
    from: string;
    to: string;
    constructor(from: string, to: string) {
      super(`非法的话术状态转移：${from} → ${to}`);
      this.name = "ScriptStateTransitionError";
      this.from = from;
      this.to = to;
      Object.setPrototypeOf(this, ScriptStateTransitionError.prototype);
    }
  }

  // 单租户 in-memory 表
  type Row = {
    id: string;
    tenantId: string;
    title: string;
    customerQuestion: string;
    answer: string;
    questionAliases: string[];
    source: string;
    status: string;
    knowledgeId: string | null;
    createdBy: string;
    usageCount: number;
    sceneTagIds: string[];
    productTagIds: string[];
    reviewedBy: string | null;
    reviewedAt: Date | null;
    rejectReason: string | null;
    submissionRequestId: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  const store = {
    rows: [] as Row[],
    seq: 0,
  };

  function resetStore() {
    store.rows = [];
    store.seq = 0;
  }

  function nextId() {
    store.seq += 1;
    const seqHex = store.seq.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${seqHex}`;
  }

  function findRow(tenantId: string, id: string): Row | undefined {
    return store.rows.find(
      (r) => r.id === id && r.tenantId === tenantId && r.deletedAt === null
    );
  }

  type ListFilters = {
    status?: string;
    q?: string;
    mineUserId?: string;
  };
  type ListPagination = { page: number; pageSize: number };

  // listScripts mock：仅复刻最常用的过滤（status / 不软删 / tenantId）
  const mockListScripts = vi.fn(async (
    tenantId: string,
    filters: ListFilters,
    pag: ListPagination
  ) => {
    let items = store.rows.filter(
      (r) => r.tenantId === tenantId && r.deletedAt === null
    );
    if (filters?.status) {
      if (filters.mineUserId) {
        items = items.filter(
          (r) => r.status === filters.status || r.createdBy === filters.mineUserId
        );
      } else {
        items = items.filter((r) => r.status === filters.status);
      }
    }
    if (filters?.q) {
      const q = filters.q as string;
      items = items.filter(
        (r) => r.title.includes(q) || r.customerQuestion.includes(q)
      );
    }
    items = [...items].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    const page = pag?.page ?? 1;
    const pageSize = pag?.pageSize ?? 20;
    const sliced = items.slice((page - 1) * pageSize, page * pageSize);
    return {
      items: sliced,
      total: items.length,
      page,
      pageSize,
    };
  });

  type CreateInput = {
    title: string;
    customerQuestion: string;
    answer: string;
    questionAliases?: string[];
    source: string;
    knowledgeId?: string | null;
    status: string;
    sceneTagIds?: string[];
    productTagIds?: string[];
  };

  const mockCreateScript = vi.fn(
    async (tenantId: string, createdBy: string, input: CreateInput) => {
      const now = new Date();
      const row: Row = {
        id: nextId(),
        tenantId,
        title: input.title,
        customerQuestion: input.customerQuestion,
        answer: input.answer,
        questionAliases: input.questionAliases ?? [],
        source: input.source,
        status: input.status,
        knowledgeId: input.knowledgeId ?? null,
        createdBy,
        usageCount: 0,
        sceneTagIds: input.sceneTagIds ?? [],
        productTagIds: input.productTagIds ?? [],
        reviewedBy: null,
        reviewedAt: null,
        rejectReason: null,
        submissionRequestId: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      store.rows = [...store.rows, row];
      return row;
    }
  );

  type UpdateInput = {
    title?: string;
    customerQuestion?: string;
    answer?: string;
    questionAliases?: string[];
    knowledgeId?: string | null;
    sceneTagIds?: string[];
    productTagIds?: string[];
  };

  const mockUpdateScript = vi.fn(
    async (tenantId: string, id: string, input: UpdateInput) => {
      const row = findRow(tenantId, id);
      if (!row) return null;
      const updated: Row = {
        ...row,
        title: input.title ?? row.title,
        customerQuestion: input.customerQuestion ?? row.customerQuestion,
        answer: input.answer ?? row.answer,
        questionAliases: input.questionAliases ?? row.questionAliases,
        knowledgeId:
          input.knowledgeId === undefined ? row.knowledgeId : input.knowledgeId,
        sceneTagIds:
          input.sceneTagIds === undefined ? row.sceneTagIds : input.sceneTagIds,
        productTagIds:
          input.productTagIds === undefined
            ? row.productTagIds
            : input.productTagIds,
        updatedAt: new Date(),
      };
      store.rows = store.rows.map((r) => (r.id === id ? updated : r));
      return updated;
    }
  );

  const mockArchiveScript = vi.fn(async (tenantId: string, id: string) => {
    const row = findRow(tenantId, id);
    if (!row) return null;
    if (row.status !== "published") {
      throw new ScriptStateTransitionError(row.status, "archived");
    }
    const updated: Row = {
      ...row,
      status: "archived",
      updatedAt: new Date(),
    };
    store.rows = store.rows.map((r) => (r.id === id ? updated : r));
    return updated;
  });

  const mockSoftDeleteScript = vi.fn(async (tenantId: string, id: string) => {
    const row = findRow(tenantId, id);
    if (!row) return null;
    const updated: Row = { ...row, deletedAt: new Date() };
    store.rows = store.rows.map((r) => (r.id === id ? updated : r));
    return updated;
  });

  return {
    mockManager,
    store,
    resetStore,
    ScriptStateTransitionError,
    mockListScripts,
    mockCreateScript,
    mockUpdateScript,
    mockArchiveScript,
    mockSoftDeleteScript,
  };
});

// ----------------------------------------------------------------------------
// Mock service / state-machine / withAuth
// ----------------------------------------------------------------------------

let currentUser = mockManager;

vi.mock("@/lib/services/scripts/repository", () => ({
  listScripts: mockListScripts,
  createScript: mockCreateScript,
  updateScript: mockUpdateScript,
  archiveScript: mockArchiveScript,
  softDeleteScript: mockSoftDeleteScript,
}));

vi.mock("@/lib/services/scripts/state-machine", () => ({
  ScriptStateTransitionError,
}));

type Handler = (
  req: NextRequest,
  ctx: { user: typeof mockManager; params?: Record<string, string> }
) => Promise<Response>;

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Handler, allowedRoles?: string[]) => {
    return async (
      req: NextRequest,
      ctx?: { params?: Promise<Record<string, string>> }
    ) => {
      if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
        const { errorResponse, ErrorCode } = await import(
          "@/lib/api-response"
        );
        return errorResponse("权限不足，无法访问", ErrorCode.FORBIDDEN);
      }
      const params = ctx?.params ? await ctx.params : undefined;
      return handler(req, { user: currentUser, params });
    };
  }),
}));

import { GET as LIST, POST as CREATE } from "@/app/api/admin/scripts/route";
import {
  PUT as UPDATE_BY_ID,
  DELETE as DELETE_BY_ID,
} from "@/app/api/admin/scripts/[id]/route";
import { POST as ARCHIVE } from "@/app/api/admin/scripts/[id]/archive/route";

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const SCENE_TAG = "11111111-1111-4111-8111-111111111111";
const PRODUCT_TAG = "22222222-2222-4222-8222-222222222222";

function listReq(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/admin/scripts");
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new Request(url.toString()) as unknown as NextRequest;
}

function postReq(path: string, body?: unknown): NextRequest {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, init) as unknown as NextRequest;
}

function putReq(path: string, body: unknown): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function deleteReq(path: string): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ----------------------------------------------------------------------------
// 串联用例
// ----------------------------------------------------------------------------

describe("管理端话术 CRUD 生命周期串联（unit25）", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    currentUser = mockManager;
  });

  it("生命周期 #1：create(draft) → list 可见 → update title → list 反映新 title", async () => {
    // 1. POST create(draft)
    const createRes = await CREATE(
      postReq("/api/admin/scripts", {
        title: "镀膜话术 v1",
        customerQuestion: "镀膜能保多久？",
        answer: "通常 12-18 个月。",
        source: "curated",
        sceneTagIds: [SCENE_TAG],
        productTagIds: [PRODUCT_TAG],
      })
    );
    const createJson = await createRes.json();
    expect(createRes.status).toBe(200);
    expect(createJson.success).toBe(true);
    expect(createJson.data.status).toBe("draft");
    expect(createJson.data.title).toBe("镀膜话术 v1");
    const id = createJson.data.id as string;

    // 2. GET list 可见，且 status=draft
    const listRes = await LIST(listReq());
    const listJson = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listJson.data).toHaveLength(1);
    expect(listJson.data[0].id).toBe(id);
    expect(listJson.data[0].status).toBe("draft");

    // 3. PUT update title
    const putRes = await UPDATE_BY_ID(
      putReq(`/api/admin/scripts/${id}`, { title: "镀膜话术 v2" }),
      ctx(id)
    );
    const putJson = await putRes.json();
    expect(putRes.status).toBe(200);
    expect(putJson.data.title).toBe("镀膜话术 v2");

    // 4. GET list 反映新 title
    const list2 = await LIST(listReq());
    const list2Json = await list2.json();
    expect(list2Json.data[0].title).toBe("镀膜话术 v2");
    expect(list2Json.data[0].status).toBe("draft");
  });

  it("生命周期 #2：create(published) → archive → list 不再有 published, 但 status=archived 可查", async () => {
    // 1. 直接创建 published
    const createRes = await CREATE(
      postReq("/api/admin/scripts", {
        title: "贴膜直接发布",
        customerQuestion: "贴膜效果",
        answer: "效果显著",
        source: "curated",
        status: "published",
      })
    );
    const created = (await createRes.json()).data;
    expect(created.status).toBe("published");
    const id = created.id as string;

    // 2. 列表按 status=published 能查到
    const pubBefore = await LIST(listReq({ status: "published" }));
    const pubBeforeJson = await pubBefore.json();
    expect(pubBeforeJson.data).toHaveLength(1);
    expect(pubBeforeJson.data[0].id).toBe(id);

    // 3. POST archive
    const archRes = await ARCHIVE(postReq(`/api/admin/scripts/${id}/archive`), ctx(id));
    const archJson = await archRes.json();
    expect(archRes.status).toBe(200);
    expect(archJson.data.status).toBe("archived");

    // 4. status=published 列表已无该条
    const pubAfter = await LIST(listReq({ status: "published" }));
    const pubAfterJson = await pubAfter.json();
    expect(pubAfterJson.data).toHaveLength(0);

    // 5. status=archived 列表能查到
    const arcList = await LIST(listReq({ status: "archived" }));
    const arcJson = await arcList.json();
    expect(arcJson.data).toHaveLength(1);
    expect(arcJson.data[0].id).toBe(id);
    expect(arcJson.data[0].status).toBe("archived");
  });

  it("生命周期 #3：archive 后再次 archive → 状态机非法 → 400", async () => {
    // 创建并直接 archive 一次
    const created = (await (
      await CREATE(
        postReq("/api/admin/scripts", {
          title: "T",
          customerQuestion: "Q",
          answer: "A",
          source: "curated",
          status: "published",
        })
      )
    ).json()).data;
    await ARCHIVE(postReq(`/api/admin/scripts/${created.id}/archive`), ctx(created.id));

    // 再次 archive：archived → archived 非法
    const res = await ARCHIVE(
      postReq(`/api/admin/scripts/${created.id}/archive`),
      ctx(created.id)
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe(1001);
    expect(json.error).toContain("archived");
  });

  it("生命周期 #4：草稿状态 archive → 状态机非法 → 400（draft 不能直接 archive）", async () => {
    const created = (await (
      await CREATE(
        postReq("/api/admin/scripts", {
          title: "草稿",
          customerQuestion: "Q",
          answer: "A",
          source: "curated",
          // 默认 status=draft
        })
      )
    ).json()).data;

    const res = await ARCHIVE(
      postReq(`/api/admin/scripts/${created.id}/archive`),
      ctx(created.id)
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe(1001);
    expect(json.error).toContain("draft");
  });

  it("生命周期 #5：DELETE 软删后，GET list 不再返回；二次 DELETE → 404", async () => {
    const created = (await (
      await CREATE(
        postReq("/api/admin/scripts", {
          title: "待删",
          customerQuestion: "Q",
          answer: "A",
          source: "curated",
        })
      )
    ).json()).data;

    // 1st DELETE：成功
    const del1 = await DELETE_BY_ID(deleteReq(`/api/admin/scripts/${created.id}`), ctx(created.id));
    const del1Json = await del1.json();
    expect(del1.status).toBe(200);
    expect(del1Json.data.deleted).toBe(true);

    // list 不再可见
    const listRes = await LIST(listReq());
    const listJson = await listRes.json();
    expect(listJson.data).toHaveLength(0);

    // 2nd DELETE：因软删后 findRow 返回 undefined → 404
    const del2 = await DELETE_BY_ID(deleteReq(`/api/admin/scripts/${created.id}`), ctx(created.id));
    const del2Json = await del2.json();
    expect(del2.status).toBe(404);
    expect(del2Json.code).toBe(1002);

    // 软删后 PUT 也走 404
    const putRes = await UPDATE_BY_ID(
      putReq(`/api/admin/scripts/${created.id}`, { title: "改不动了" }),
      ctx(created.id)
    );
    const putJson = await putRes.json();
    expect(putRes.status).toBe(404);
    expect(putJson.code).toBe(1002);
  });

  it("生命周期 #6：完整链路 create(draft) → update → 'published' (用单独条) → archive → 检查状态序列", async () => {
    // create draft
    const draftCreated = (await (
      await CREATE(
        postReq("/api/admin/scripts", {
          title: "全流程",
          customerQuestion: "Q",
          answer: "A v1",
          source: "curated",
        })
      )
    ).json()).data;
    expect(draftCreated.status).toBe("draft");

    // update content
    const upd = await UPDATE_BY_ID(
      putReq(`/api/admin/scripts/${draftCreated.id}`, {
        answer: "A v2 改进版",
        questionAliases: ["别名 1", "别名 2"],
      }),
      ctx(draftCreated.id)
    );
    const updJson = await upd.json();
    expect(upd.status).toBe(200);
    expect(updJson.data.answer).toBe("A v2 改进版");
    expect(updJson.data.questionAliases).toEqual(["别名 1", "别名 2"]);

    // 直接发布另一条（模拟 "manager 直接发布"）
    const pubCreated = (await (
      await CREATE(
        postReq("/api/admin/scripts", {
          title: "直接发布条",
          customerQuestion: "Q2",
          answer: "A2",
          source: "curated",
          status: "published",
        })
      )
    ).json()).data;
    expect(pubCreated.status).toBe("published");

    // archive 已发布的那条
    const archRes = await ARCHIVE(
      postReq(`/api/admin/scripts/${pubCreated.id}/archive`),
      ctx(pubCreated.id)
    );
    expect(archRes.status).toBe(200);

    // 列表合计：1 draft + 1 archived = 2 条；按 status 分别校验
    const all = await LIST(listReq());
    const allJson = await all.json();
    expect(allJson.data).toHaveLength(2);
    const states = allJson.data.map((r: { status: string }) => r.status).sort();
    expect(states).toEqual(["archived", "draft"]);

    // 双独立 id 互不影响
    expect(draftCreated.id).not.toBe(pubCreated.id);
  });

  it("生命周期 #7：跨租户隔离 — tenant-2 用户看不到 tenant-1 的话术", async () => {
    // tenant-1 创建一条
    const created = (await (
      await CREATE(
        postReq("/api/admin/scripts", {
          title: "tenant-1 私有",
          customerQuestion: "Q",
          answer: "A",
          source: "curated",
        })
      )
    ).json()).data;

    // 切换到 tenant-2 manager
    currentUser = {
      ...mockManager,
      id: "user-mgr-2",
      tenantId: "tenant-2",
    };

    const res = await LIST(listReq());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(0);

    // tenant-2 直接 archive tenant-1 的 id：service 返回 null → 404
    const archRes = await ARCHIVE(
      postReq(`/api/admin/scripts/${created.id}/archive`),
      ctx(created.id)
    );
    const archJson = await archRes.json();
    expect(archRes.status).toBe(404);
    expect(archJson.code).toBe(1002);

    // tenant-2 PUT tenant-1 的 id：service 返回 null → 404
    const putRes = await UPDATE_BY_ID(
      putReq(`/api/admin/scripts/${created.id}`, { title: "越权改" }),
      ctx(created.id)
    );
    const putJson = await putRes.json();
    expect(putRes.status).toBe(404);
    expect(putJson.code).toBe(1002);
  });
});
