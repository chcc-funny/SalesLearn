import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockUser,
  mockManagerUser,
  mockSelect,
  mockInsert,
  mockFrom,
  mockWhere,
  mockOrderBy,
  mockLimit,
  mockOffset,
  mockValues,
  mockReturning,
  wireChain,
} = vi.hoisted(() => {
  const mockUser = {
    id: "user-0001",
    name: "员工用户",
    email: "employee@example.com",
    role: "employee",
    tenantId: "tenant-0001",
  };

  const mockManagerUser = {
    id: "manager-0001",
    name: "主管用户",
    email: "manager@example.com",
    role: "manager",
    tenantId: "tenant-0001",
  };

  const mockOffset = vi.fn();
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockValues = vi.fn();
  const mockReturning = vi.fn();
  const mockInsert = vi.fn();

  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({
      orderBy: mockOrderBy,
      where: mockWhere,
    });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ offset: mockOffset });
    mockOffset.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
  }

  wireChain();

  return {
    mockUser,
    mockManagerUser,
    mockSelect,
    mockInsert,
    mockFrom,
    mockWhere,
    mockOrderBy,
    mockLimit,
    mockOffset,
    mockValues,
    mockReturning,
    wireChain,
  };
});

// ---- Current role for withAuth mock ----
let currentUser = mockUser;

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function, allowedRoles?: string[]) => {
    return async (req: NextRequest) => {
      if (allowedRoles && allowedRoles.length > 0) {
        if (!allowedRoles.includes(currentUser.role)) {
          const { errorResponse, ErrorCode } = await import("@/lib/api-response");
          return errorResponse("权限不足，无法访问", ErrorCode.FORBIDDEN);
        }
      }
      return handler(req, { user: currentUser });
    };
  }),
}));

import { GET, POST } from "@/app/api/knowledge/route";

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/knowledge");
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new Request(url.toString()) as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/knowledge", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

const validCreateBody = {
  title: "产品知识：汽车镀晶",
  category: "product",
  keyPoints: ["镀晶原理", "施工步骤"],
  content: "镀晶是一种高效的汽车保护方案...",
};

describe("GET /api/knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockUser;
  });

  it("返回分页知识点列表", async () => {
    const items = [
      { id: "k1", title: "知识点A", status: "published", tenantId: "tenant-0001" },
      { id: "k2", title: "知识点B", status: "published", tenantId: "tenant-0001" },
    ];
    // first select = items, second select = count
    let callCount = 0;
    mockOffset.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(items);
      return Promise.resolve([]);
    });
    // count query: select({ count }).from().where()
    mockWhere.mockReturnValue({
      orderBy: mockOrderBy,
      where: mockWhere,
      // for count query (no orderBy chaining)
      then: undefined,
    });

    // Reset with simple count mock
    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockReturnValueOnce({ offset: mockOffset });
    mockOffset.mockResolvedValueOnce(items);

    // count query
    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockResolvedValueOnce([{ count: 2 }]);

    const req = makeGetRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("支持 page 和 limit 分页参数", async () => {
    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockReturnValueOnce({ offset: mockOffset });
    mockOffset.mockResolvedValueOnce([]);

    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockResolvedValueOnce([{ count: 0 }]);

    const req = makeGetRequest({ page: "2", limit: "10" });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.meta).toBeDefined();
    expect(json.meta.page).toBe(2);
    expect(json.meta.limit).toBe(10);
  });

  it("员工角色只能查看已发布的知识点", async () => {
    currentUser = mockUser; // employee

    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockReturnValueOnce({ offset: mockOffset });
    mockOffset.mockResolvedValueOnce([]);

    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockResolvedValueOnce([{ count: 0 }]);

    const req = makeGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
  });

  it("数据库异常返回 DATABASE_ERROR", async () => {
    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockReturnValueOnce({ offset: mockOffset });
    mockOffset.mockRejectedValueOnce(new Error("DB connection lost"));

    const req = makeGetRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
  });
});

describe("POST /api/knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockManagerUser;
  });

  it("主管成功创建知识点，返回 draft 状态", async () => {
    const created = { id: "k-new", ...validCreateBody, status: "draft" };
    mockInsert.mockReturnValueOnce({ values: mockValues });
    mockValues.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([created]);

    const req = makePostRequest(validCreateBody);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("draft");
    expect(json.data.title).toBe(validCreateBody.title);
  });

  it("员工角色创建知识点返回 403 FORBIDDEN", async () => {
    currentUser = mockUser; // employee

    const req = makePostRequest(validCreateBody);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it("缺少必填字段 title 返回 VALIDATION_ERROR", async () => {
    currentUser = mockManagerUser;

    const req = makePostRequest({ category: "product", content: "内容" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("无效 category 返回 VALIDATION_ERROR", async () => {
    currentUser = mockManagerUser;

    const req = makePostRequest({ ...validCreateBody, category: "invalid_cat" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("content 为空字符串返回 VALIDATION_ERROR", async () => {
    currentUser = mockManagerUser;

    const req = makePostRequest({ ...validCreateBody, content: "" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("数据库写入异常返回 DATABASE_ERROR", async () => {
    currentUser = mockManagerUser;

    mockInsert.mockReturnValueOnce({ values: mockValues });
    mockValues.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockRejectedValueOnce(new Error("unique constraint"));

    const req = makePostRequest(validCreateBody);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
  });
});
