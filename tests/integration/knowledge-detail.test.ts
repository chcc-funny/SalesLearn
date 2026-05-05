import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockManagerUser,
  mockEmployeeUser,
  mockSelect,
  mockUpdate,
  mockDelete,
  mockFrom,
  mockWhere,
  mockDeleteWhere,
  mockLimit,
  mockSet,
  mockReturning,
  wireChain,
} = vi.hoisted(() => {
  const mockManagerUser = {
    id: "manager-0001",
    name: "主管用户",
    email: "manager@example.com",
    role: "manager",
    tenantId: "tenant-0001",
  };

  const mockEmployeeUser = {
    id: "user-0001",
    name: "员工用户",
    email: "employee@example.com",
    role: "employee",
    tenantId: "tenant-0001",
  };

  const mockReturning = vi.fn();
  const mockLimit = vi.fn();
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  // detail DELETE route: db.delete().where() — where itself is awaited (no returning)
  const mockDeleteWhere = vi.fn();
  const mockDelete = vi.fn();

  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, where: mockWhere, returning: mockReturning });
    mockLimit.mockResolvedValue([]);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockReturning.mockResolvedValue([]);
    // delete route: db.delete(table).where(...) — where is awaited directly
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
    mockDeleteWhere.mockResolvedValue(undefined);
  }

  wireChain();

  return {
    mockManagerUser,
    mockEmployeeUser,
    mockSelect,
    mockUpdate,
    mockDelete,
    mockFrom,
    mockWhere,
    mockDeleteWhere,
    mockLimit,
    mockSet,
    mockReturning,
    wireChain,
  };
});

let currentUser = mockManagerUser;

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function, allowedRoles?: string[]) => {
    return async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) => {
      if (allowedRoles && allowedRoles.length > 0) {
        if (!allowedRoles.includes(currentUser.role)) {
          const { errorResponse, ErrorCode } = await import("@/lib/api-response");
          return errorResponse("权限不足，无法访问", ErrorCode.FORBIDDEN);
        }
      }
      const params = ctx?.params ? await ctx.params : undefined;
      return handler(req, { user: currentUser, params });
    };
  }),
}));

import { GET, PUT, DELETE } from "@/app/api/knowledge/[id]/route";

const VALID_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function makeContext(id = VALID_ID) {
  return { params: Promise.resolve({ id }) };
}

function makeGetRequest(id = VALID_ID): NextRequest {
  return new Request(`http://localhost/api/knowledge/${id}`) as unknown as NextRequest;
}

function makePutRequest(body: unknown, id = VALID_ID): NextRequest {
  return new Request(`http://localhost/api/knowledge/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

function makeDeleteRequest(id = VALID_ID): NextRequest {
  return new Request(`http://localhost/api/knowledge/${id}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
}

const sampleItem = {
  id: VALID_ID,
  tenantId: "tenant-0001",
  title: "量子膜产品介绍",
  category: "product",
  status: "published",
  content: "量子膜采用纳米陶瓷技术",
  keyPoints: ["要点1"],
  images: [],
};

describe("GET /api/knowledge/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockManagerUser;
  });

  it("GET 一条已存在的知识点 → 200", async () => {
    mockLimit.mockResolvedValueOnce([sampleItem]);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(VALID_ID);
    expect(json.data.title).toBe(sampleItem.title);
  });

  it("GET 不存在的知识点 → 404 NOT_FOUND", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("不存在");
  });

  it("GET 跨租户 id（tenantId 不匹配）→ NOT_FOUND", async () => {
    // where 条件已过滤 tenantId，查不到返回空
    mockLimit.mockResolvedValueOnce([]);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("员工 GET draft 状态的知识点 → 404 NOT_FOUND", async () => {
    currentUser = mockEmployeeUser;
    const draftItem = { ...sampleItem, status: "draft" };
    mockLimit.mockResolvedValueOnce([draftItem]);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("员工 GET reviewing 状态的知识点 → 404 NOT_FOUND", async () => {
    currentUser = mockEmployeeUser;
    const reviewingItem = { ...sampleItem, status: "reviewing" };
    mockLimit.mockResolvedValueOnce([reviewingItem]);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("员工 GET published 知识点 → 200", async () => {
    currentUser = mockEmployeeUser;
    mockLimit.mockResolvedValueOnce([sampleItem]);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("数据库异常 → 500 DATABASE_ERROR", async () => {
    mockLimit.mockRejectedValueOnce(new Error("DB error"));

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
  });
});

describe("PUT /api/knowledge/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockManagerUser;
  });

  it("PUT 更新 title → 200", async () => {
    // 第一次 select 查存在性
    mockLimit.mockResolvedValueOnce([{ id: VALID_ID }]);
    const updated = { ...sampleItem, title: "新标题" };
    mockReturning.mockResolvedValueOnce([updated]);

    const req = makePutRequest({ title: "新标题" });
    const res = await PUT(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.title).toBe("新标题");
  });

  it("PUT status=published → 200，验证 set 调用包含 reviewedBy 和 reviewedAt", async () => {
    mockLimit.mockResolvedValueOnce([{ id: VALID_ID }]);
    const updated = {
      ...sampleItem,
      status: "published",
      reviewedBy: mockManagerUser.id,
      reviewedAt: new Date(),
    };
    mockReturning.mockResolvedValueOnce([updated]);

    const req = makePutRequest({ status: "published" });
    const res = await PUT(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    // 验证 set 包含 reviewedBy（用当前 manager id）和 reviewedAt
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewedBy: mockManagerUser.id,
        reviewedAt: expect.any(Date),
      })
    );
  });

  it("PUT status=draft → 200，不写 reviewedBy/reviewedAt", async () => {
    mockLimit.mockResolvedValueOnce([{ id: VALID_ID }]);
    const updated = { ...sampleItem, status: "draft" };
    mockReturning.mockResolvedValueOnce([updated]);

    const req = makePutRequest({ status: "draft" });
    const res = await PUT(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    // set 不应包含 reviewedBy（因为 status !== published）
    const setCallArg = mockSet.mock.calls[0][0];
    expect(setCallArg).not.toHaveProperty("reviewedBy");
    expect(setCallArg).not.toHaveProperty("reviewedAt");
  });

  it("PUT status=reviewing → 200，不写 reviewedBy/reviewedAt", async () => {
    mockLimit.mockResolvedValueOnce([{ id: VALID_ID }]);
    const updated = { ...sampleItem, status: "reviewing" };
    mockReturning.mockResolvedValueOnce([updated]);

    const req = makePutRequest({ status: "reviewing" });
    const res = await PUT(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const setCallArg = mockSet.mock.calls[0][0];
    expect(setCallArg).not.toHaveProperty("reviewedBy");
  });

  it("员工 PUT → 403 FORBIDDEN", async () => {
    currentUser = mockEmployeeUser;

    const req = makePutRequest({ title: "非法修改" });
    const res = await PUT(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it("PUT 跨租户（知识点不存在）→ 404 NOT_FOUND", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = makePutRequest({ title: "修改" });
    const res = await PUT(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("PUT 无效 status 值 → 400 VALIDATION_ERROR", async () => {
    const req = makePutRequest({ status: "bad_status" });
    const res = await PUT(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("PUT 空 title → 400 VALIDATION_ERROR", async () => {
    const req = makePutRequest({ title: "" });
    const res = await PUT(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("数据库异常 → 500 DATABASE_ERROR", async () => {
    mockLimit.mockResolvedValueOnce([{ id: VALID_ID }]);
    mockReturning.mockRejectedValueOnce(new Error("DB error"));

    const req = makePutRequest({ title: "新标题" });
    const res = await PUT(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
  });
});

describe("DELETE /api/knowledge/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockManagerUser;
  });

  it("DELETE 成功 → 200，返回 deleted: true", async () => {
    mockLimit.mockResolvedValueOnce([{ id: VALID_ID }]);
    // db.delete(table).where(...) is awaited directly — mockDeleteWhere resolves undefined
    mockDeleteWhere.mockResolvedValueOnce(undefined);

    const req = makeDeleteRequest();
    const res = await DELETE(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.deleted).toBe(true);
  });

  it("DELETE 知识点不存在 → 404 NOT_FOUND", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = makeDeleteRequest();
    const res = await DELETE(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("员工 DELETE → 403 FORBIDDEN", async () => {
    currentUser = mockEmployeeUser;

    const req = makeDeleteRequest();
    const res = await DELETE(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it("数据库异常 → 500 DATABASE_ERROR", async () => {
    mockLimit.mockResolvedValueOnce([{ id: VALID_ID }]);
    mockDeleteWhere.mockRejectedValueOnce(new Error("DB error"));

    const req = makeDeleteRequest();
    const res = await DELETE(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
  });
});
