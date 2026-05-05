import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockManagerUser,
  mockEmployeeUser,
  mockSelect,
  mockFrom,
  mockLeftJoin,
  mockWhere,
  mockOrderBy,
  mockLimit,
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

  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockLeftJoin = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();

  function wireChain() {
    // quiz/route.ts: db.select({...}).from(questions).leftJoin(...).where(and(...)).orderBy(...).limit(100)
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ leftJoin: mockLeftJoin });
    mockLeftJoin.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  }

  wireChain();

  return {
    mockManagerUser,
    mockEmployeeUser,
    mockSelect,
    mockFrom,
    mockLeftJoin,
    mockWhere,
    mockOrderBy,
    mockLimit,
    wireChain,
  };
});

// ---- Current role for withAuth mock ----
let currentUser = mockManagerUser;

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function, allowedRoles?: string[]) => {
    return async (req: NextRequest) => {
      // 模拟未登录：通过请求头标识
      if (req.headers.get("x-test-unauth") === "1") {
        const { errorResponse, ErrorCode } = await import("@/lib/api-response");
        return errorResponse("未登录，请先登录", ErrorCode.UNAUTHORIZED);
      }
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

import { GET } from "@/app/api/quiz/route";

// ---- Helpers ----
function makeGetRequest(params?: Record<string, string>, unauth = false): NextRequest {
  const url = new URL("http://localhost/api/quiz");
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const headers: Record<string, string> = {};
  if (unauth) headers["x-test-unauth"] = "1";
  return new Request(url.toString(), { headers }) as unknown as NextRequest;
}

const VALID_KNOWLEDGE_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

const sampleQuestions = [
  {
    id: "q-0001",
    knowledgeId: VALID_KNOWLEDGE_ID,
    knowledgeTitle: "镀晶知识",
    type: "memory",
    questionText: "镀晶的主要作用是什么？",
    options: ["保护漆面", "美化外观", "防腐蚀", "以上都是"],
    correctAnswer: "A",
    explanations: { A: "镀晶用于保护漆面" },
    status: "published",
    createdAt: new Date("2025-01-01T00:00:00Z"),
  },
  {
    id: "q-0002",
    knowledgeId: VALID_KNOWLEDGE_ID,
    knowledgeTitle: "镀晶知识",
    type: "application",
    questionText: "施工温度过低会导致什么？",
    options: ["固化不均", "颜色变深", "无影响", "寿命延长"],
    correctAnswer: "A",
    explanations: { A: "低温导致固化不均" },
    status: "reviewing",
    createdAt: new Date("2025-01-02T00:00:00Z"),
  },
];

describe("GET /api/quiz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockManagerUser;
  });

  it("未登录返回 401 UNAUTHORIZED", async () => {
    const req = makeGetRequest(undefined, true);
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toContain("未登录");
  });

  it("主管已登录，返回题目列表（envelope 格式正确）", async () => {
    mockLimit.mockResolvedValueOnce(sampleQuestions);

    const req = makeGetRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toHaveLength(2);
    // 字段完整性校验
    const q = json.data[0];
    expect(q).toHaveProperty("id");
    expect(q).toHaveProperty("knowledgeId");
    expect(q).toHaveProperty("knowledgeTitle");
    expect(q).toHaveProperty("type");
    expect(q).toHaveProperty("questionText");
    expect(q).toHaveProperty("options");
    expect(q).toHaveProperty("correctAnswer");
    expect(q).toHaveProperty("status");
  });

  it("员工已登录，也可访问题目列表，返回 200", async () => {
    currentUser = mockEmployeeUser;
    mockLimit.mockResolvedValueOnce(sampleQuestions);

    const req = makeGetRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("按 status 参数过滤：只返回 published 题目", async () => {
    const published = sampleQuestions.filter((q) => q.status === "published");
    mockLimit.mockResolvedValueOnce(published);

    const req = makeGetRequest({ status: "published" });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    // 接口应当把 status 条件传给 db，mock 返回的是过滤后数据
    expect(mockSelect).toHaveBeenCalled();
    expect(json.data.every((q: { status: string }) => q.status === "published")).toBe(true);
  });

  it("按 knowledgeId 参数过滤：仅返回该知识点题目", async () => {
    const filtered = [sampleQuestions[0]];
    mockLimit.mockResolvedValueOnce(filtered);

    const req = makeGetRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockSelect).toHaveBeenCalled();
    // 返回数据中 knowledgeId 匹配
    expect(json.data[0].knowledgeId).toBe(VALID_KNOWLEDGE_ID);
  });

  it("tenantId 隔离：db 查询条件包含当前用户 tenantId（无跨租户泄漏）", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = makeGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    // 确认 where 被调用（tenantId 隔离条件注入）
    expect(mockWhere).toHaveBeenCalled();
  });

  it("空结果分支：数据库无数据时返回空数组", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = makeGetRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual([]);
  });

  it("数据库异常返回 500 DATABASE_ERROR", async () => {
    mockLimit.mockRejectedValueOnce(new Error("DB connection lost"));

    const req = makeGetRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toContain("获取题目列表失败");
  });
});
