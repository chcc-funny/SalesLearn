import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockManagerUser,
  mockEmployeeUser,
  mockSelect,
  mockFrom,
  mockWhere,
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
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();

  /**
   * by-knowledge/[knowledgeId]/route.ts 的查询链：
   *
   * 查询1（知识点存在性）：
   *   db.select({id,title}).from(knowledgeBase).where(and(...)).limit(1)
   *   链：select → from → where → limit（resolve）
   *
   * 查询2（获取题目）：
   *   db.select({...}).from(questions).where(and(...))   ← 直接 await，无 limit
   *   链：select → from → where（resolve）
   *
   * wireChain 默认设置通用链，每个测试按需用 mockReturnValueOnce 控制。
   */
  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    // 默认 where 返回 limit（用于第一个查询）；第二个查询需在 test 中用 mockResolvedValueOnce
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  }

  wireChain();

  return {
    mockManagerUser,
    mockEmployeeUser,
    mockSelect,
    mockFrom,
    mockWhere,
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
    return async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) => {
      // 模拟未登录
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
      const params = ctx?.params ? await ctx.params : undefined;
      return handler(req, { user: currentUser, params });
    };
  }),
}));

import { GET } from "@/app/api/quiz/by-knowledge/[knowledgeId]/route";

// ---- Constants ----
const VALID_KNOWLEDGE_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const OTHER_TENANT_KNOWLEDGE_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

// ---- Helpers ----
function makeContext(knowledgeId = VALID_KNOWLEDGE_ID) {
  return { params: Promise.resolve({ knowledgeId }) };
}

function makeGetRequest(knowledgeId = VALID_KNOWLEDGE_ID, unauth = false): NextRequest {
  const headers: Record<string, string> = {};
  if (unauth) headers["x-test-unauth"] = "1";
  return new Request(
    `http://localhost/api/quiz/by-knowledge/${knowledgeId}`,
    { headers }
  ) as unknown as NextRequest;
}

const mockKnowledge = {
  id: VALID_KNOWLEDGE_ID,
  title: "镀晶知识",
};

const mockPublishedQuestions = [
  {
    id: "q-0001",
    type: "memory",
    questionText: "镀晶的主要作用是什么？",
    options: ["保护漆面", "美化外观", "防腐蚀", "以上都是"],
    correctAnswer: "A",
    explanations: { A: "镀晶用于保护漆面" },
  },
  {
    id: "q-0002",
    type: "application",
    questionText: "施工温度过低会导致什么？",
    options: ["固化不均", "颜色变深", "无影响", "寿命延长"],
    correctAnswer: "A",
    explanations: { A: "低温导致固化不均" },
  },
];

describe("GET /api/quiz/by-knowledge/[knowledgeId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockEmployeeUser;
  });

  it("未登录返回 401 UNAUTHORIZED", async () => {
    const req = makeGetRequest(VALID_KNOWLEDGE_ID, true);
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toContain("未登录");
  });

  it("知识点不存在或未发布返回 404 NOT_FOUND", async () => {
    // 第一次调用：select knowledge → where → limit → 返回空
    mockLimit.mockResolvedValueOnce([]);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("不存在或未发布");
  });

  it("知识点存在且已发布，返回题目列表（envelope 格式正确）", async () => {
    // 查询1：select knowledge → from → where → limit([mockKnowledge])
    // mockResolvedValueOnce 优先级高于 mockReturnValue，需显式排队：
    // 第1次 where 调用（查询1）返回 { limit }，第2次（查询2）直接 resolve
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    // 查询2：select questions → from → where（直接 await）
    mockWhere.mockResolvedValueOnce(mockPublishedQuestions);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.knowledgeId).toBe(VALID_KNOWLEDGE_ID);
    expect(json.data.knowledgeTitle).toBe("镀晶知识");
    expect(json.data.total).toBe(2);
    expect(Array.isArray(json.data.questions)).toBe(true);
    // 字段完整性校验
    const q = json.data.questions[0];
    expect(q).toHaveProperty("id");
    expect(q).toHaveProperty("type");
    expect(q).toHaveProperty("questionText");
    expect(q).toHaveProperty("options");
    expect(q).toHaveProperty("correctAnswer");
    expect(q).toHaveProperty("explanations");
    // 不应暴露 status / tenantId（路由 select 没有选这两个字段）
    expect(q).not.toHaveProperty("status");
  });

  it("员工角色也可访问，返回 200", async () => {
    currentUser = mockEmployeeUser;
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockWhere.mockResolvedValueOnce(mockPublishedQuestions);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("主管角色也可访问，返回 200", async () => {
    currentUser = mockManagerUser;
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockWhere.mockResolvedValueOnce(mockPublishedQuestions);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("tenantId 隔离：其他租户的知识点不可见，返回 404", async () => {
    // where 条件含 tenantId，mock 跨租户查询返回空
    mockLimit.mockResolvedValueOnce([]);

    const req = makeGetRequest(OTHER_TENANT_KNOWLEDGE_ID);
    const res = await GET(req, makeContext(OTHER_TENANT_KNOWLEDGE_ID));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("知识点存在但题目为空，返回 total: 0 + questions: []", async () => {
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    // 查询2：questions 为空
    mockWhere.mockResolvedValueOnce([]);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.total).toBe(0);
    expect(json.data.questions).toEqual([]);
  });

  it("数据库异常返回 500 DATABASE_ERROR", async () => {
    // 查 knowledge 成功：where → limit
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    // 查 questions 时 where 直接抛出异常
    mockWhere.mockRejectedValueOnce(new Error("DB connection lost"));

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toContain("获取题目失败");
  });
});
