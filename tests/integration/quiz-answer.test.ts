import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Use vi.hoisted so mock fns are available in vi.mock factory ---
const {
  mockUser,
  mockLimit,
  mockReturning,
  mockSet,
  mockWhere,
  mockValues,
  mockFrom,
  mockSelect,
  mockInsert,
  mockUpdate,
  wireChain,
} = vi.hoisted(() => {
  const mockUser = {
    id: "aaaa-bbbb-cccc-dddd",
    name: "Test User",
    email: "test@example.com",
    role: "employee",
    tenantId: "tttt-0000-1111-2222",
  };

  const mockLimit = vi.fn();
  const mockReturning = vi.fn();
  const mockSet = vi.fn();
  const mockWhere = vi.fn();
  const mockValues = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();

  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, where: mockWhere });
    mockLimit.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
  }

  wireChain();

  return {
    mockUser,
    mockLimit,
    mockReturning,
    mockSet,
    mockWhere,
    mockValues,
    mockFrom,
    mockSelect,
    mockInsert,
    mockUpdate,
    wireChain,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function) => {
    return async (req: Request) => {
      return handler(req, { user: mockUser });
    };
  }),
}));

import { POST } from "@/app/api/quiz/answer/route";

// --- Helpers ---
function makeRequest(body: unknown) {
  return new Request("http://localhost/api/quiz/answer", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validQuestionId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const validKnowledgeId = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

const publishedQuestion = {
  id: validQuestionId,
  tenantId: mockUser.tenantId,
  knowledgeId: validKnowledgeId,
  type: "memory",
  questionText: "Which product is best?",
  options: { A: "opt1", B: "opt2", C: "opt3", D: "opt4" },
  correctAnswer: "B",
  explanations: { detail: "B is the correct answer" },
  status: "published",
};

describe("POST /api/quiz/answer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("正确答案返回 isCorrect: true", async () => {
    let limitCallCount = 0;
    mockLimit.mockImplementation(() => {
      limitCallCount++;
      if (limitCallCount === 1) return Promise.resolve([publishedQuestion]);
      return Promise.resolve([]);
    });

    const mockRecord = { id: "record-1" };
    mockReturning.mockResolvedValue([mockRecord]);

    const req = makeRequest({
      questionId: validQuestionId,
      selectedAnswer: "B",
      timeSpent: 10,
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.isCorrect).toBe(true);
    expect(json.data.correctAnswer).toBe("B");
    expect(json.data.recordId).toBe("record-1");
  });

  it("错误答案返回 isCorrect: false，触发错题本写入", async () => {
    let limitCallCount = 0;
    mockLimit.mockImplementation(() => {
      limitCallCount++;
      if (limitCallCount === 1) return Promise.resolve([publishedQuestion]);
      return Promise.resolve([]);
    });

    const mockRecord = { id: "record-2" };
    mockReturning.mockResolvedValue([mockRecord]);

    const req = makeRequest({
      questionId: validQuestionId,
      selectedAnswer: "A",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.isCorrect).toBe(false);
    expect(json.data.correctAnswer).toBe("B");
    expect(json.data.recordId).toBe("record-2");

    // errorBook insert: insert called twice (test record + errorBook entry)
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it("缺少必要字段返回 VALIDATION_ERROR", async () => {
    const req = makeRequest({});

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("无效的 selectedAnswer 返回 VALIDATION_ERROR", async () => {
    const req = makeRequest({
      questionId: validQuestionId,
      selectedAnswer: "E",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("题目不存在返回 NOT_FOUND", async () => {
    mockLimit.mockResolvedValue([]);

    const req = makeRequest({
      questionId: validQuestionId,
      selectedAnswer: "A",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1002);
    expect(json.error).toContain("题目不存在");
  });
});
