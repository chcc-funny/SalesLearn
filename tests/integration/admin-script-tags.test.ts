import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：管理端标签 CRUD（unit24）
 *
 *  GET  /api/admin/script-tags         列表（按 group / onlyActive 过滤）
 *  POST /api/admin/script-tags         创建
 *  PUT  /api/admin/script-tags/[id]    更新（name / sortOrder / isActive）
 *  DELETE /api/admin/script-tags/[id]  软删（is_active=false，保留历史关联）
 *
 *  - 全部 manager only；employee → 403
 *  - 跨租户：service 内强制 tenantId = session.user.tenantId
 *  - 401 黑盒契约
 */

const {
  mockEmployee,
  mockManager,
  mockListTags,
  mockCreateTag,
  mockUpdateTag,
  mockSoftDeleteTag,
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
    mockListTags: vi.fn(),
    mockCreateTag: vi.fn(),
    mockUpdateTag: vi.fn(),
    mockSoftDeleteTag: vi.fn(),
  };
});

let currentUser: typeof mockEmployee = mockManager;

vi.mock("@/lib/services/scripts/tags", () => ({
  listTags: mockListTags,
  createTag: mockCreateTag,
  updateTag: mockUpdateTag,
  softDeleteTag: mockSoftDeleteTag,
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

import { GET, POST } from "@/app/api/admin/script-tags/route";
import {
  PUT,
  DELETE,
} from "@/app/api/admin/script-tags/[id]/route";

const TAG_ID = "11111111-1111-4111-8111-111111111111";

const sceneTag = {
  id: TAG_ID,
  tenantId: "tenant-1",
  groupKey: "scene",
  name: "客户进店",
  sortOrder: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const productTag = {
  ...sceneTag,
  id: "22222222-2222-4222-8222-222222222222",
  groupKey: "product",
  name: "镀膜",
};

function makeContext(id = TAG_ID) {
  return { params: Promise.resolve({ id }) };
}

function makeGetRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/admin/script-tags${query}`, {
    method: "GET",
  }) as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return new Request(`http://localhost/api/admin/script-tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makePutRequest(body: unknown, id = TAG_ID): NextRequest {
  return new Request(`http://localhost/api/admin/script-tags/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makeDeleteRequest(id = TAG_ID): NextRequest {
  return new Request(`http://localhost/api/admin/script-tags/${id}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
}

describe("GET /api/admin/script-tags (unit24 集成 - 列表)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManager;
    mockListTags.mockResolvedValue([sceneTag, productTag]);
  });

  it("列表成功 → 200 + 全部标签", async () => {
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(mockListTags).toHaveBeenCalledWith("tenant-1", expect.any(Object));
  });

  it("?groupKey=scene → service 收到 groupKey:'scene'", async () => {
    mockListTags.mockResolvedValueOnce([sceneTag]);
    const res = await GET(makeGetRequest("?groupKey=scene"));
    expect(res.status).toBe(200);
    const [, options] = mockListTags.mock.calls[0];
    expect(options.groupKey).toBe("scene");
  });

  it("?onlyActive=false → service 收到 onlyActive:false", async () => {
    const res = await GET(makeGetRequest("?onlyActive=false"));
    expect(res.status).toBe(200);
    const [, options] = mockListTags.mock.calls[0];
    expect(options.onlyActive).toBe(false);
  });

  it("默认 onlyActive=true（不传参时）", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const [, options] = mockListTags.mock.calls[0];
    expect(options.onlyActive).toBe(true);
  });

  it("非法 groupKey → 400", async () => {
    const res = await GET(makeGetRequest("?groupKey=invalid"));
    expect(res.status).toBe(400);
    expect(mockListTags).not.toHaveBeenCalled();
  });

  it("员工调用 → 403", async () => {
    currentUser = mockEmployee;
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
    expect(mockListTags).not.toHaveBeenCalled();
  });

  it("DB 异常 → 500", async () => {
    mockListTags.mockRejectedValueOnce(new Error("DB lost"));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });

  it("跨租户安全：service 收到 session.user.tenantId", async () => {
    await GET(makeGetRequest());
    const [tenantId] = mockListTags.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
  });
});

describe("POST /api/admin/script-tags (unit24 集成 - 创建)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManager;
    mockCreateTag.mockResolvedValue(sceneTag);
  });

  it("创建成功 → 200", async () => {
    const res = await POST(
      makePostRequest({ groupKey: "scene", name: "新场景" })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.id).toBe(TAG_ID);

    const [tenantId, input] = mockCreateTag.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(input.groupKey).toBe("scene");
    expect(input.name).toBe("新场景");
  });

  it("默认 sortOrder=0 / isActive=true（zod default）", async () => {
    await POST(makePostRequest({ groupKey: "scene", name: "默认值" }));
    const [, input] = mockCreateTag.mock.calls[0];
    expect(input.sortOrder).toBe(0);
    expect(input.isActive).toBe(true);
  });

  it("缺 groupKey → 400", async () => {
    const res = await POST(makePostRequest({ name: "无 group" }));
    expect(res.status).toBe(400);
    expect(mockCreateTag).not.toHaveBeenCalled();
  });

  it("非法 groupKey → 400", async () => {
    const res = await POST(
      makePostRequest({ groupKey: "invalid", name: "X" })
    );
    expect(res.status).toBe(400);
    expect(mockCreateTag).not.toHaveBeenCalled();
  });

  it("name 超长（>50）→ 400", async () => {
    const res = await POST(
      makePostRequest({ groupKey: "scene", name: "a".repeat(51) })
    );
    expect(res.status).toBe(400);
  });

  it("员工调用 → 403", async () => {
    currentUser = mockEmployee;
    const res = await POST(
      makePostRequest({ groupKey: "scene", name: "X" })
    );
    expect(res.status).toBe(403);
    expect(mockCreateTag).not.toHaveBeenCalled();
  });

  it("非法 JSON → 400", async () => {
    const req = new Request(`http://localhost/api/admin/script-tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("跨租户安全：body 中的 tenantId 被忽略", async () => {
    await POST(
      makePostRequest({
        groupKey: "scene",
        name: "X",
        tenantId: "tenant-attacker",
      })
    );
    const [tenantId] = mockCreateTag.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
  });

  it("DB 异常 → 500", async () => {
    mockCreateTag.mockRejectedValueOnce(new Error("DB lost"));
    const res = await POST(
      makePostRequest({ groupKey: "scene", name: "X" })
    );
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/admin/script-tags/[id] (unit24 集成 - 更新)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManager;
    mockUpdateTag.mockResolvedValue(sceneTag);
  });

  it("更新 name → 200", async () => {
    const res = await PUT(makePutRequest({ name: "改名后" }), makeContext());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const [tenantId, id, input] = mockUpdateTag.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(id).toBe(TAG_ID);
    expect(input.name).toBe("改名后");
  });

  it("更新 sortOrder + isActive → service 收到两字段", async () => {
    await PUT(
      makePutRequest({ sortOrder: 5, isActive: false }),
      makeContext()
    );
    const [, , input] = mockUpdateTag.mock.calls[0];
    expect(input.sortOrder).toBe(5);
    expect(input.isActive).toBe(false);
  });

  it("空 body → 400", async () => {
    const res = await PUT(makePutRequest({}), makeContext());
    expect(res.status).toBe(400);
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("body 含 groupKey 也被 zod 忽略（不允许跨 group 改组）", async () => {
    await PUT(
      makePutRequest({ name: "X", groupKey: "product" }),
      makeContext()
    );
    const [, , input] = mockUpdateTag.mock.calls[0];
    expect(input.groupKey).toBeUndefined();
  });

  it("不存在 / 跨租户（service 返回 null）→ 404", async () => {
    mockUpdateTag.mockResolvedValueOnce(null);
    const res = await PUT(makePutRequest({ name: "X" }), makeContext());
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.code).toBe(1002);
  });

  it("缺 id → 400", async () => {
    const res = await PUT(makePutRequest({ name: "X" }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(400);
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("非 UUID id → 400", async () => {
    const res = await PUT(makePutRequest({ name: "X" }, "not-uuid"), {
      params: Promise.resolve({ id: "not-uuid" }),
    });
    expect(res.status).toBe(400);
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("员工调用 → 403", async () => {
    currentUser = mockEmployee;
    const res = await PUT(makePutRequest({ name: "X" }), makeContext());
    expect(res.status).toBe(403);
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("DB 异常 → 500", async () => {
    mockUpdateTag.mockRejectedValueOnce(new Error("DB lost"));
    const res = await PUT(makePutRequest({ name: "X" }), makeContext());
    expect(res.status).toBe(500);
  });

  it("非法 JSON → 400", async () => {
    const req = new Request(`http://localhost/api/admin/script-tags/${TAG_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    }) as unknown as NextRequest;
    const res = await PUT(req, makeContext());
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/admin/script-tags/[id] (unit24 集成 - 软删)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManager;
    mockSoftDeleteTag.mockResolvedValue({ ...sceneTag, isActive: false });
  });

  it("软删成功 → 200 + deleted=true", async () => {
    const res = await DELETE(makeDeleteRequest(), makeContext());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.deleted).toBe(true);
    expect(mockSoftDeleteTag).toHaveBeenCalledWith("tenant-1", TAG_ID);
  });

  it("不存在 / 跨租户（service 返回 null）→ 404", async () => {
    mockSoftDeleteTag.mockResolvedValueOnce(null);
    const res = await DELETE(makeDeleteRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it("缺 id → 400", async () => {
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(400);
    expect(mockSoftDeleteTag).not.toHaveBeenCalled();
  });

  it("非 UUID id → 400", async () => {
    const res = await DELETE(makeDeleteRequest("not-uuid"), {
      params: Promise.resolve({ id: "not-uuid" }),
    });
    expect(res.status).toBe(400);
    expect(mockSoftDeleteTag).not.toHaveBeenCalled();
  });

  it("员工调用 → 403", async () => {
    currentUser = mockEmployee;
    const res = await DELETE(makeDeleteRequest(), makeContext());
    expect(res.status).toBe(403);
    expect(mockSoftDeleteTag).not.toHaveBeenCalled();
  });

  it("DB 异常 → 500", async () => {
    mockSoftDeleteTag.mockRejectedValueOnce(new Error("DB lost"));
    const res = await DELETE(makeDeleteRequest(), makeContext());
    expect(res.status).toBe(500);
  });
});

describe("/api/admin/script-tags 401 黑盒契约", () => {
  it("各方法未登录 → 401", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/guard", async () => {
      const { errorResponse, ErrorCode } = await import("@/lib/api-response");
      return {
        withAuth: () => async () => {
          return errorResponse("未登录，请先登录", ErrorCode.UNAUTHORIZED);
        },
      };
    });
    vi.doMock("@/lib/services/scripts/tags", () => ({
      listTags: vi.fn(),
      createTag: vi.fn(),
      updateTag: vi.fn(),
      softDeleteTag: vi.fn(),
    }));

    const { GET: GET_real, POST: POST_real } = await import(
      "@/app/api/admin/script-tags/route"
    );
    const { PUT: PUT_real, DELETE: DELETE_real } = await import(
      "@/app/api/admin/script-tags/[id]/route"
    );

    const r1 = await GET_real(makeGetRequest());
    expect(r1.status).toBe(401);

    const r2 = await POST_real(
      makePostRequest({ groupKey: "scene", name: "X" })
    );
    expect(r2.status).toBe(401);

    const r3 = await PUT_real(
      makePutRequest({ name: "X" }),
      makeContext()
    );
    expect(r3.status).toBe(401);

    const r4 = await DELETE_real(makeDeleteRequest(), makeContext());
    expect(r4.status).toBe(401);
  });
});
