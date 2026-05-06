import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：PUT / DELETE /api/admin/scripts/[id]（unit21）
 *
 * PUT 覆盖：
 *  - 更新基础字段（title / customerQuestion / answer / questionAliases / knowledgeId / 标签）
 *  - 校验失败：空 body / 非法字段 / 超长 → 400
 *  - 不存在 / 跨租户 → 404
 *  - 不允许通过 PUT 改 status（status 字段不在 updateScriptSchema 中）
 *  - 角色限制：employee → 403
 *  - DB 异常 → 500
 *
 * DELETE 覆盖：
 *  - 软删成功 → 200 + { deleted: true }
 *  - 不存在 / 跨租户（service 返回 null）→ 404
 *  - 缺 id → 400
 *  - 角色限制：employee → 403
 *  - DB 异常 → 500
 *  - 401 黑盒契约
 */

const {
  mockEmployee,
  mockManager,
  mockUpdateScript,
  mockSoftDeleteScript,
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
    mockUpdateScript: vi.fn(),
    mockSoftDeleteScript: vi.fn(),
  };
});

let currentUser: typeof mockEmployee = mockManager;

vi.mock("@/lib/services/scripts/repository", () => ({
  updateScript: mockUpdateScript,
  softDeleteScript: mockSoftDeleteScript,
}));

type Handler = (
  req: NextRequest,
  ctx: { user: typeof mockEmployee; params?: Record<string, string> }
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

import { PUT, DELETE } from "@/app/api/admin/scripts/[id]/route";

const VALID_ID = "00000000-0000-4000-8000-000000000001";
const SCENE_TAG_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_TAG_ID = "22222222-2222-4222-8222-222222222222";

function makeContext(id = VALID_ID) {
  return { params: Promise.resolve({ id }) };
}

function makePutRequest(body: unknown, id = VALID_ID): NextRequest {
  return new Request(`http://localhost/api/admin/scripts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makeDeleteRequest(id = VALID_ID): NextRequest {
  return new Request(`http://localhost/api/admin/scripts/${id}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
}

const baseScript = {
  id: VALID_ID,
  tenantId: "tenant-1",
  title: "更新后",
  customerQuestion: "问题",
  answer: "答案",
  source: "curated",
  status: "draft",
  createdBy: "user-mgr-1",
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
  tagIds: [SCENE_TAG_ID],
};

describe("PUT /api/admin/scripts/[id] (unit21 集成 - 更新)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManager;
    mockUpdateScript.mockResolvedValue(baseScript);
  });

  it("更新 title → 200 + service 收到 patch 字段", async () => {
    const res = await PUT(
      makePutRequest({ title: "更新后" }),
      makeContext()
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.title).toBe("更新后");

    expect(mockUpdateScript).toHaveBeenCalledTimes(1);
    const [tenantId, id, input] = mockUpdateScript.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(id).toBe(VALID_ID);
    expect(input.title).toBe("更新后");
  });

  it("更新标签（同时改场景/产品）→ service 收到两个标签数组", async () => {
    const res = await PUT(
      makePutRequest({
        sceneTagIds: [SCENE_TAG_ID],
        productTagIds: [PRODUCT_TAG_ID],
      }),
      makeContext()
    );
    expect(res.status).toBe(200);
    const [, , input] = mockUpdateScript.mock.calls[0];
    expect(input.sceneTagIds).toEqual([SCENE_TAG_ID]);
    expect(input.productTagIds).toEqual([PRODUCT_TAG_ID]);
  });

  it("更新 questionAliases / knowledgeId → 透传", async () => {
    const KID = "33333333-3333-4333-8333-333333333333";
    const res = await PUT(
      makePutRequest({
        questionAliases: ["别名1", "别名2"],
        knowledgeId: KID,
      }),
      makeContext()
    );
    expect(res.status).toBe(200);
    const [, , input] = mockUpdateScript.mock.calls[0];
    expect(input.questionAliases).toEqual(["别名1", "别名2"]);
    expect(input.knowledgeId).toBe(KID);
  });

  it("空 body（无任何字段）→ 400 VALIDATION_ERROR", async () => {
    const res = await PUT(makePutRequest({}), makeContext());
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe(1001);
    expect(mockUpdateScript).not.toHaveBeenCalled();
  });

  it("title 超长 → 400", async () => {
    const longTitle = "a".repeat(201);
    const res = await PUT(
      makePutRequest({ title: longTitle }),
      makeContext()
    );
    expect(res.status).toBe(400);
  });

  it("非法 sceneTagIds（非 UUID）→ 400", async () => {
    const res = await PUT(
      makePutRequest({ sceneTagIds: ["not-uuid"] }),
      makeContext()
    );
    expect(res.status).toBe(400);
  });

  it("PUT body 含 status 字段也不会被路由层透传给 service（updateSchema 不含 status）", async () => {
    // status 字段不在 updateScriptSchema 中，会被 zod 忽略；如果开启 strict 则会报错
    // 此处验证：即使 body 含 status，service.updateScript 也不会收到 status 字段
    const res = await PUT(
      makePutRequest({ title: "新标题", status: "published" }),
      makeContext()
    );
    expect(res.status).toBe(200);
    const [, , input] = mockUpdateScript.mock.calls[0];
    expect(input.status).toBeUndefined();
  });

  it("话术不存在（service 返回 null）→ 404 NOT_FOUND", async () => {
    mockUpdateScript.mockResolvedValueOnce(null);
    const res = await PUT(
      makePutRequest({ title: "T" }),
      makeContext()
    );
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.code).toBe(1002);
  });

  it("缺 id → 400", async () => {
    const res = await PUT(makePutRequest({ title: "T" }), {
      params: Promise.resolve({}),
    });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe(1001);
    expect(mockUpdateScript).not.toHaveBeenCalled();
  });

  it("员工调用 → 403", async () => {
    currentUser = mockEmployee;
    const res = await PUT(
      makePutRequest({ title: "T" }),
      makeContext()
    );
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.code).toBe(2002);
    expect(mockUpdateScript).not.toHaveBeenCalled();
  });

  it("DB 异常 → 500", async () => {
    mockUpdateScript.mockRejectedValueOnce(new Error("DB lost"));
    const res = await PUT(
      makePutRequest({ title: "T" }),
      makeContext()
    );
    expect(res.status).toBe(500);
  });

  it("非法 JSON 体 → 400", async () => {
    const req = new Request(
      `http://localhost/api/admin/scripts/${VALID_ID}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }
    ) as unknown as NextRequest;
    const res = await PUT(req, makeContext());
    expect(res.status).toBe(400);
  });

  it("跨租户安全：service 收到的 tenantId 始终来自 session.user", async () => {
    await PUT(
      makePutRequest({
        title: "T",
        // 即使 body 塞 tenantId 也不会被路由层使用
        tenantId: "tenant-attacker",
      }),
      makeContext()
    );
    const [tenantId] = mockUpdateScript.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
  });
});

describe("DELETE /api/admin/scripts/[id] (unit21 集成 - 软删)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManager;
    mockSoftDeleteScript.mockResolvedValue(baseScript);
  });

  it("软删成功 → 200 + deleted=true", async () => {
    const res = await DELETE(makeDeleteRequest(), makeContext());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.deleted).toBe(true);

    expect(mockSoftDeleteScript).toHaveBeenCalledWith("tenant-1", VALID_ID);
  });

  it("不存在 / 跨租户（service 返回 null）→ 404", async () => {
    mockSoftDeleteScript.mockResolvedValueOnce(null);
    const res = await DELETE(makeDeleteRequest(), makeContext());
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.code).toBe(1002);
  });

  it("缺 id → 400", async () => {
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({}),
    });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe(1001);
    expect(mockSoftDeleteScript).not.toHaveBeenCalled();
  });

  it("员工调用 → 403", async () => {
    currentUser = mockEmployee;
    const res = await DELETE(makeDeleteRequest(), makeContext());
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.code).toBe(2002);
    expect(mockSoftDeleteScript).not.toHaveBeenCalled();
  });

  it("DB 异常 → 500", async () => {
    mockSoftDeleteScript.mockRejectedValueOnce(new Error("DB lost"));
    const res = await DELETE(makeDeleteRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});

describe("/api/admin/scripts/[id] 401 黑盒契约", () => {
  it("PUT 未登录 → 401", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/guard", async () => {
      const { errorResponse, ErrorCode } = await import("@/lib/api-response");
      return {
        withAuth: () => async () => {
          return errorResponse("未登录，请先登录", ErrorCode.UNAUTHORIZED);
        },
      };
    });
    const { PUT: PUT_real, DELETE: DELETE_real } = await import(
      "@/app/api/admin/scripts/[id]/route"
    );

    const res1 = await PUT_real(
      new Request(`http://localhost/api/admin/scripts/${VALID_ID}`, {
        method: "PUT",
        body: JSON.stringify({ title: "T" }),
      }) as unknown as NextRequest,
      makeContext()
    );
    expect(res1.status).toBe(401);
    expect((await res1.json()).code).toBe(2001);

    const res2 = await DELETE_real(
      new Request(`http://localhost/api/admin/scripts/${VALID_ID}`, {
        method: "DELETE",
      }) as unknown as NextRequest,
      makeContext()
    );
    expect(res2.status).toBe(401);
    expect((await res2.json()).code).toBe(2001);
  });
});
