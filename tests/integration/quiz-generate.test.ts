import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockManagerUser,
  mockEmployeeUser,
  mockChatCompletionJSON,
  mockSelect,
  mockInsert,
  mockFrom,
  mockWhere,
  mockLimit,
  mockValues,
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
  const mockValues = vi.fn();
  const mockLimit = vi.fn();
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockChatCompletionJSON = vi.fn();

  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
  }

  wireChain();

  return {
    mockManagerUser,
    mockEmployeeUser,
    mockChatCompletionJSON,
    mockSelect,
    mockInsert,
    mockFrom,
    mockWhere,
    mockLimit,
    mockValues,
    mockReturning,
    wireChain,
  };
});

let currentUser = mockManagerUser;

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock("@/lib/llm/openrouter", () => ({
  chatCompletionJSON: mockChatCompletionJSON,
  LLM_MODELS: {
    KIMI_K2: "moonshotai/kimi-k2",
    CLAUDE_SONNET: "anthropic/claude-sonnet-4",
    CLAUDE_HAIKU: "anthropic/claude-haiku-4-5",
  },
}));

vi.mock("@/lib/llm/quiz-prompt", () => ({
  QUIZ_SYSTEM_PROMPT: "system prompt",
  QUIZ_FEW_SHOT: "few shot examples",
  buildQuizUserPrompt: vi.fn(() => "user prompt content"),
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

import { POST } from "@/app/api/quiz/generate/route";

const VALID_KNOWLEDGE_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/quiz/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

const mockKnowledge = {
  id: VALID_KNOWLEDGE_ID,
  tenantId: "tenant-0001",
  title: "汽车镀晶知识",
  keyPoints: ["镀晶原理"],
  content: "镀晶保护原理详解...",
  commonMistakes: "常见施工错误",
  status: "published",
};

function makeGeneratedQuestion(overrides = {}) {
  return {
    type: "memory",
    question_text: "镀晶的主要作用是什么?",
    options: ["保护漆面", "美化外观", "防腐蚀", "以上都是"],
    correct_answer: "A",
    explanations: { A: "镀晶主要用于保护漆面" },
    ...overrides,
  };
}

describe("POST /api/quiz/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockManagerUser;
  });

  it("员工角色生成题目返回 403 FORBIDDEN", async () => {
    currentUser = mockEmployeeUser;

    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it("无效的 knowledgeId（非 UUID）返回 VALIDATION_ERROR", async () => {
    const req = makeRequest({ knowledgeId: "not-a-uuid" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
    expect(json.error).toContain("无效的知识点 ID");
  });

  it("知识点不存在返回 NOT_FOUND", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("不存在");
  });

  it("AI 成功生成题目，插入数据库返回结果", async () => {
    mockLimit.mockResolvedValueOnce([mockKnowledge]);

    const generatedQ = makeGeneratedQuestion();
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { questions: [generatedQ] },
    });

    const inserted = [
      {
        id: "q-new-1",
        tenantId: "tenant-0001",
        knowledgeId: VALID_KNOWLEDGE_ID,
        type: "memory",
        questionText: generatedQ.question_text,
        options: generatedQ.options,
        correctAnswer: "A",
        explanations: generatedQ.explanations,
        status: "reviewing",
      },
    ];
    mockReturning.mockResolvedValueOnce(inserted);

    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID, count: 1 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.generated).toBe(1);
    expect(Array.isArray(json.data.questions)).toBe(true);
    expect(json.data.questions[0].status).toBe("reviewing");
  });

  it("AI 返回空题目列表返回 LLM_ERROR", async () => {
    mockLimit.mockResolvedValueOnce([mockKnowledge]);

    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { questions: [] },
    });

    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.error).toContain("AI 未能生成题目");
  });

  it("AI 返回格式不合规的题目（correct_answer 不在 ABCD 内）时过滤后为空返回 LLM_ERROR", async () => {
    mockLimit.mockResolvedValueOnce([mockKnowledge]);

    mockChatCompletionJSON.mockResolvedValueOnce({
      data: {
        questions: [
          makeGeneratedQuestion({ correct_answer: "E" }), // invalid
        ],
      },
    });

    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.error).toContain("格式不合规");
  });
});
