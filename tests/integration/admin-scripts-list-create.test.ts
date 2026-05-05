import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：GET / POST /api/admin/scripts（unit20）
 *
 * GET 覆盖：
 *  - 主管视角：列表（支持 q / status / source / sceneTagIds / productTagIds / page / pageSize）
 *  - 默认查询：tenant 隔离 + 不带 mineUserId（管理端可读全部）
 *  - 校验失败：非法 status → 400 VALIDATION_ERROR
 *  - 角色限制：employee 调用 → 403 FORBIDDEN（withAuth allowedRoles=['manager']）
 *  - DB 异常 → 500
 *  - 未登录 → 401（黑盒契约）
 *
 * POST 覆盖：
 *  - 主管创建：state=draft 起步（默认）
 *  - 主管直接 published（创建时允许 draft / published；其它状态由 review/archive 接口流转）
 *  - 标签同时写入
 *  - 校验失败：缺 title → 400
 *  - 跨租户安全：service 层 createScript 收到的 tenantId = session.user.tenantId
 *  - 角色限制：employee 调用 → 403
 *  - DB 异常 → 500
 *
 * Mock 策略：service 层 listScripts / createScript 直接 mock；rate limit 不参与
 */

const {
  mockEmployee,
  mockManager,
  mockListScripts,
  mockCreateScript,
} = vi.hoisted(() => {
  const mockEmployee = {
    id: "user-emp-1",
    name: "员工",
    email: "emp@example.com",
    role: "employee",
    tenantId: "tenant-1",
  };
  const mockManager = {
    id: "user-mgr-1",
    name: "主管",
    email: "mgr@example.com",
    role: "manager",
    tenantId: "tenant-1",
  };
  return {
    mockEmployee,
    mockManager,
    mockListScripts: vi.fn(),
    mockCreateScript: vi.fn(),
  };
});

let currentUser: typeof mockEmployee = mockManager;

vi.mock("@/lib/services/scripts/repository", () => ({
  listScripts: mockListScripts,
  createScript: mockCreateScript,
}));

type Handler = (
  req: NextRequest,
  ctx: { user: typeof mockEmployee; params?: Record<string, string> }
) => Promise<Response>;

vi.mock("@/lib/auth/guard", () => ({
  // mock 的 withAuth 会按 allowedRoles 校验当前 user.role；员工不在 ['manager'] 中 → 403
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

import { GET, POST } from "@/app/api/admin/scripts/route";

const SCENE_TAG_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_TAG_ID = "22222222-2222-4222-8222-222222222222";

function makeListRequest(
  params?: Record<string, string | string[]>
): NextRequest {
  const url = new URL("http://localhost/api/admin/scripts");
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        v.forEach((iv) => url.searchParams.append(k, iv));
      } else {
        url.searchParams.set(k, v);
      }
    });
  }
  return new Request(url.toString()) as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/admin/scripts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const sampleScript = {
  id: "00000000-0000-4000-8000-000000000001",
  tenantId: "tenant-1",
  title: "标题",
  customerQuestion: "问题",
  answer: "答案",
  source: "curated",
  status: "draft",
  createdBy: mockManager.id,
  usageCount: 0,
  questionAliases: [],
  knowledgeId: null,
  reviewedBy: null,
  reviewedAt: null,
  rejectReason: null,
  submissionRequestId: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  tagIds: [SCENE_TAG_ID, PRODUCT_TAG_ID],
};

describe("GET /api/admin/scripts (unit20 集成 - 列表)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManager;
    mockListScripts.mockResolvedValue({
      items: [sampleScript],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it("主管默认请求 → 200 + 不带 mineUserId（管理端可读全部）", async () => {
    const res = await GET(makeListRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);

    expect(mockListScripts).toHaveBeenCalledTimes(1);
    const [tenantId, filters, pagination] = mockListScripts.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(filters.mineUserId).toBeUndefined();
    expect(pagination).toEqual({ page: 1, pageSize: 20 });
  });

  it("主管按 status=pending_review 筛选 → service 收到 status", async () => {
    const res = await GET(makeListRequest({ status: "pending_review" }));
    expect(res.status).toBe(200);
    const [, filters] = mockListScripts.mock.calls[0];
    expect(filters.status).toBe("pending_review");
  });

  it("主管按 q + sceneTagIds 筛选 → 透传", async () => {
    const res = await GET(
      makeListRequest({
        q: "镀膜",
        sceneTagIds: [SCENE_TAG_ID],
        productTagIds: [PRODUCT_TAG_ID],
        source: "ai_submitted",
      })
    );
    expect(res.status).toBe(200);
    const [, filters] = mockListScripts.mock.calls[0];
    expect(filters.q).toBe("镀膜");
    expect(filters.sceneTagIds).toEqual([SCENE_TAG_ID]);
    expect(filters.productTagIds).toEqual([PRODUCT_TAG_ID]);
    expect(filters.source).toBe("ai_submitted");
  });

  it("主管分页 page=3&pageSize=50", async () => {
    mockListScripts.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 3,
      pageSize: 50,
    });
    const res = await GET(makeListRequest({ page: "3", pageSize: "50" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.meta.page).toBe(3);
    expect(json.meta.limit).toBe(50);
    const [, , pagination] = mockListScripts.mock.calls[0];
    expect(pagination).toEqual({ page: 3, pageSize: 50 });
  });

  it("非法 status → 400 VALIDATION_ERROR", async () => {
    const res = await GET(makeListRequest({ status: "invalid" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe(1001);
    expect(mockListScripts).not.toHaveBeenCalled();
  });

  it("员工调用 → 403 FORBIDDEN（角色限制）", async () => {
    currentUser = mockEmployee;
    const res = await GET(makeListRequest());
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.code).toBe(2002); // FORBIDDEN
    expect(mockListScripts).not.toHaveBeenCalled();
  });

  it("DB 异常 → 500 DATABASE_ERROR", async () => {
    mockListScripts.mockRejectedValueOnce(new Error("DB lost"));
    const res = await GET(makeListRequest());
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.code).toBe(4004);
  });
});

describe("POST /api/admin/scripts (unit20 集成 - 创建)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManager;
    mockCreateScript.mockResolvedValue(sampleScript);
  });

  it("主管创建 draft 起步（默认 status=draft）→ 200", async () => {
    const res = await POST(
      makePostRequest({
        title: "新话术",
        customerQuestion: "问题",
        answer: "答案",
        source: "curated",
        sceneTagIds: [SCENE_TAG_ID],
        productTagIds: [PRODUCT_TAG_ID],
      })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(sampleScript.id);

    expect(mockCreateScript).toHaveBeenCalledTimes(1);
    const [tenantId, createdBy, input] = mockCreateScript.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(createdBy).toBe(mockManager.id);
    expect(input.status).toBe("draft");
    expect(input.title).toBe("新话术");
    expect(input.sceneTagIds).toEqual([SCENE_TAG_ID]);
    expect(input.productTagIds).toEqual([PRODUCT_TAG_ID]);
  });

  it("主管直接 published（管理端发布）→ 200 + service 收到 status=published", async () => {
    mockCreateScript.mockResolvedValueOnce({
      ...sampleScript,
      status: "published",
    });
    const res = await POST(
      makePostRequest({
        title: "直接发布",
        customerQuestion: "Q",
        answer: "A",
        source: "curated",
        status: "published",
      })
    );
    expect(res.status).toBe(200);
    const [, , input] = mockCreateScript.mock.calls[0];
    expect(input.status).toBe("published");
  });

  it("缺 title → 400 VALIDATION_ERROR", async () => {
    const res = await POST(
      makePostRequest({
        customerQuestion: "Q",
        answer: "A",
        source: "curated",
      })
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe(1001);
    expect(mockCreateScript).not.toHaveBeenCalled();
  });

  it("非法 source → 400", async () => {
    const res = await POST(
      makePostRequest({
        title: "T",
        customerQuestion: "Q",
        answer: "A",
        source: "not-a-source",
      })
    );
    expect(res.status).toBe(400);
  });

  it("创建时 status=archived 非法 → 400（zod 限制）", async () => {
    // 创建仅允许 draft / published；状态机驱动其他状态
    const res = await POST(
      makePostRequest({
        title: "T",
        customerQuestion: "Q",
        answer: "A",
        source: "curated",
        status: "archived",
      })
    );
    expect(res.status).toBe(400);
  });

  it("员工调用 → 403 FORBIDDEN", async () => {
    currentUser = mockEmployee;
    const res = await POST(
      makePostRequest({
        title: "T",
        customerQuestion: "Q",
        answer: "A",
        source: "curated",
      })
    );
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.code).toBe(2002);
    expect(mockCreateScript).not.toHaveBeenCalled();
  });

  it("DB 异常 → 500 DATABASE_ERROR", async () => {
    mockCreateScript.mockRejectedValueOnce(new Error("conn lost"));
    const res = await POST(
      makePostRequest({
        title: "T",
        customerQuestion: "Q",
        answer: "A",
        source: "curated",
      })
    );
    expect(res.status).toBe(500);
  });

  it("跨租户安全：service 收到的 tenantId 始终来自 session.user", async () => {
    // 即使 body 里塞 tenantId 字段也不会被使用
    const res = await POST(
      makePostRequest({
        title: "T",
        customerQuestion: "Q",
        answer: "A",
        source: "curated",
        tenantId: "tenant-attacker",
      })
    );
    expect(res.status).toBe(200);
    const [tenantId] = mockCreateScript.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
  });
});

describe("/api/admin/scripts 401 黑盒契约", () => {
  it("未登录 → 401 UNAUTHORIZED + code=2001", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/guard", async () => {
      const { errorResponse, ErrorCode } = await import("@/lib/api-response");
      return {
        withAuth: () => async () => {
          return errorResponse("未登录，请先登录", ErrorCode.UNAUTHORIZED);
        },
      };
    });
    const { GET: GET_real, POST: POST_real } = await import(
      "@/app/api/admin/scripts/route"
    );

    const res1 = await GET_real(
      new Request("http://localhost/api/admin/scripts") as unknown as NextRequest
    );
    expect(res1.status).toBe(401);
    expect((await res1.json()).code).toBe(2001);

    const res2 = await POST_real(
      new Request("http://localhost/api/admin/scripts", {
        method: "POST",
        body: "{}",
      }) as unknown as NextRequest
    );
    expect(res2.status).toBe(401);
    expect((await res2.json()).code).toBe(2001);
  });
});
