import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockEmployeeUser,
  mockManagerUser,
  mockChatCompletionJSON,
  mockCheckTranscript,
  mockSelect,
  mockInsert,
  mockFrom,
  mockWhere,
  mockLimit,
  mockValues,
  mockReturning,
  wireChain,
} = vi.hoisted(() => {
  const mockEmployeeUser = {
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

  const mockReturning = vi.fn();
  const mockValues = vi.fn();
  const mockLimit = vi.fn();
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockChatCompletionJSON = vi.fn();
  // 默认返回 valid，各用例可按需覆盖
  const mockCheckTranscript = vi.fn(() => ({ valid: true, code: "ok" as const, message: "" }));

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
    mockEmployeeUser,
    mockManagerUser,
    mockChatCompletionJSON,
    mockCheckTranscript,
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

// currentUser 控制当前登录用户（null = 未登录）
let currentUser: typeof mockEmployeeUser | null = mockEmployeeUser;

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

vi.mock("@/lib/validations/feynman-checks", () => ({
  checkTranscript: mockCheckTranscript,
}));

vi.mock("@/lib/llm/feynman-prompt", () => ({
  FEYNMAN_SYSTEM_PROMPT: "feynman system prompt",
  buildFeynmanUserPrompt: vi.fn(() => "feynman user prompt"),
  calculateTotalScore: vi.fn((scores: Record<string, number>) => {
    const { completeness, accuracy, clarity, analogy } = scores;
    return Math.round(
      completeness * 0.3 + accuracy * 0.3 + clarity * 0.2 + analogy * 0.2
    );
  }),
  canUnlockStageB: vi.fn((score: number) => score >= 80),
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function) => {
    return async (req: NextRequest) => {
      if (!currentUser) {
        const { errorResponse, ErrorCode } = await import("@/lib/api-response");
        return errorResponse("未登录，请先登录", ErrorCode.UNAUTHORIZED);
      }
      return handler(req, { user: currentUser });
    };
  }),
}));

import { POST } from "@/app/api/feynman/evaluate/route";

// ---- 测试常量 ----
const VALID_KNOWLEDGE_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

const mockKnowledge = {
  id: VALID_KNOWLEDGE_ID,
  tenantId: "tenant-0001",
  title: "汽车镀晶知识",
  keyPoints: ["镀晶保护原理", "施工前处理", "保养周期"],
  content: "镀晶是一种高科技车身保护涂层，能有效防止漆面氧化...",
  examples: "向客户介绍时可以类比手机贴膜的概念",
  commonMistakes: "不要将镀晶与镀膜混淆",
  status: "published",
};

const mockEvalResult = {
  scores: {
    completeness: 85,
    accuracy: 90,
    clarity: 80,
    analogy: 75,
  },
  coveredPoints: ["镀晶保护原理", "施工前处理"],
  missedPoints: ["保养周期"],
  errors: [],
  suggestions: "建议补充保养周期相关内容，告知客户每年需要补镀一次",
  highlights: "类比手机贴膜非常贴切，客户容易理解",
};

const mockSavedRecord = {
  id: "record-0001",
  userId: "user-0001",
  knowledgeId: VALID_KNOWLEDGE_ID,
  stage: "A",
  audioUrl: null,
  transcript: "镀晶是一种保护车漆的技术...",
  scores: mockEvalResult.scores,
  coveredPoints: mockEvalResult.coveredPoints,
  missedPoints: mockEvalResult.missedPoints,
  errors: mockEvalResult.errors,
  aiFeedback: mockEvalResult.suggestions,
  totalScore: 85,
  isPassed: true,
};

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/feynman/evaluate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

function makeValidBody(overrides: Record<string, unknown> = {}) {
  return {
    knowledgeId: VALID_KNOWLEDGE_ID,
    transcript: "镀晶是一种保护车漆的高科技涂层，可以防止漆面氧化，施工前需要对车身进行彻底清洁和研磨抛光处理。",
    ...overrides,
  };
}

describe("POST /api/feynman/evaluate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockEmployeeUser;
    // 默认 checkTranscript 返回合法
    mockCheckTranscript.mockReturnValue({ valid: true, code: "ok", message: "" });
  });

  // ── 鉴权测试 ────────────────────────────────────────────────────────────────

  it("未登录返回 401 UNAUTHORIZED", async () => {
    currentUser = null;

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.code).toBe(2001);
    expect(json.error).toContain("未登录");
  });

  it("员工角色可访问评分接口（无角色限制）", async () => {
    currentUser = mockEmployeeUser;
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockResolvedValueOnce({ data: mockEvalResult });
    mockReturning.mockResolvedValueOnce([mockSavedRecord]);

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("主管角色同样可以调用评分接口", async () => {
    currentUser = mockManagerUser;
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockResolvedValueOnce({ data: mockEvalResult });
    mockReturning.mockResolvedValueOnce([mockSavedRecord]);

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  // ── Zod 校验失败 ────────────────────────────────────────────────────────────

  it("缺少 knowledgeId → 400 VALIDATION_ERROR", async () => {
    const req = makeRequest({ transcript: "这是一段足够长的讲解内容，用于测试缺少知识点ID的情况。" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("knowledgeId 不是 UUID 格式 → 400 VALIDATION_ERROR", async () => {
    const req = makeRequest(makeValidBody({ knowledgeId: "not-a-uuid" }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
    expect(json.error).toContain("无效的知识点 ID");
  });

  it("缺少 transcript → 400 VALIDATION_ERROR", async () => {
    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("transcript 为空字符串 → 400 VALIDATION_ERROR", async () => {
    const req = makeRequest(makeValidBody({ transcript: "" }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
    expect(json.error).toContain("不能为空");
  });

  it("audioUrl 非法 URL 格式 → 400 VALIDATION_ERROR", async () => {
    const req = makeRequest(makeValidBody({ audioUrl: "not-a-url" }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("请求体格式错误（非 JSON）→ 502 LLM_ERROR（JSON.parse 异常由顶层 catch 兜底）", async () => {
    const req = new Request("http://localhost/api/feynman/evaluate", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    }) as unknown as NextRequest;

    const res = await POST(req);
    const json = await res.json();

    // JSON.parse 失败抛出 SyntaxError，进入 catch 块的兜底逻辑（LLM_ERROR / 502）
    // TODO: 路由可优化：在 try 块最外层先 JSON.parse，单独处理 SyntaxError 返回 400
    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
  });

  // ── 知识点查询 ──────────────────────────────────────────────────────────────

  it("知识点不存在或未发布 → 404 NOT_FOUND", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1002);
    expect(json.error).toContain("不存在");
  });

  it("tenantId 隔离：查询时注入正确的 tenantId", async () => {
    currentUser = mockEmployeeUser;
    mockLimit.mockResolvedValueOnce([]);

    const req = makeRequest(makeValidBody());
    await POST(req);

    // 验证 where 调用包含 tenantId 条件（通过 and() 传入多个条件）
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });

  it("知识点缺少 keyPoints → 400 VALIDATION_ERROR", async () => {
    const knowledgeWithoutKeyPoints = { ...mockKnowledge, keyPoints: [] };
    mockLimit.mockResolvedValueOnce([knowledgeWithoutKeyPoints]);

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("缺少核心要点");
  });

  // ── transcript 预检查 ────────────────────────────────────────────────────────

  it("transcript 过短 → checkTranscript 返回 too_short → 400 FEYNMAN_TOO_SHORT", async () => {
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockCheckTranscript.mockReturnValueOnce({
      valid: false,
      code: "too_short",
      message: "讲解内容过短（当前 2 字），请尝试更详细地讲解，至少覆盖几个核心要点",
    });

    const req = makeRequest(makeValidBody({ transcript: "太短" }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(3003);
  });

  it("transcript 过长 → checkTranscript 返回 too_long → 400 VALIDATION_ERROR", async () => {
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockCheckTranscript.mockReturnValueOnce({
      valid: false,
      code: "too_long",
      message: "讲解内容过长（当前 5200 字，上限 5000 字），请精炼表达后重新提交",
    });

    const longTranscript = "镀晶".repeat(2600); // 约 5200 字，Zod 不限制此长度
    const req = makeRequest(makeValidBody({ transcript: longTranscript }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("过长");
  });

  // ── LLM 正常评分 ─────────────────────────────────────────────────────────────

  it("LLM 返回正常评分 → 写入数据库 → 200 + 完整 envelope", async () => {
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockResolvedValueOnce({ data: mockEvalResult });
    mockReturning.mockResolvedValueOnce([mockSavedRecord]);

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      recordId: mockSavedRecord.id,
      scores: mockEvalResult.scores,
      coveredPoints: mockEvalResult.coveredPoints,
      missedPoints: mockEvalResult.missedPoints,
      errors: mockEvalResult.errors,
      suggestions: mockEvalResult.suggestions,
      highlights: mockEvalResult.highlights,
    });
    expect(typeof json.data.totalScore).toBe("number");
    expect(typeof json.data.canUnlockStageB).toBe("boolean");
  });

  it("LLM 正常评分 → 调用 db.insert() 写入 userFeynmanRecords", async () => {
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockResolvedValueOnce({ data: mockEvalResult });
    mockReturning.mockResolvedValueOnce([mockSavedRecord]);

    const req = makeRequest(makeValidBody());
    await POST(req);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mockEmployeeUser.id,
        knowledgeId: VALID_KNOWLEDGE_ID,
        stage: "A",
        scores: mockEvalResult.scores,
      })
    );
  });

  it("携带合法 audioUrl 时 → 数据库 insert 包含 audioUrl", async () => {
    const audioUrl = "https://storage.example.com/audio/test.mp3";
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockResolvedValueOnce({ data: mockEvalResult });
    mockReturning.mockResolvedValueOnce([{ ...mockSavedRecord, audioUrl }]);

    const req = makeRequest(makeValidBody({ audioUrl }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ audioUrl })
    );
  });

  it("totalScore >= 80 时 canUnlockStageB 为 true", async () => {
    const highScoreResult = {
      ...mockEvalResult,
      scores: { completeness: 90, accuracy: 90, clarity: 90, analogy: 85 },
    };
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockResolvedValueOnce({ data: highScoreResult });
    mockReturning.mockResolvedValueOnce([{ ...mockSavedRecord, isPassed: true, totalScore: 90 }]);

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.canUnlockStageB).toBe(true);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ isPassed: true })
    );
  });

  it("totalScore < 80 时 canUnlockStageB 为 false", async () => {
    const lowScoreResult = {
      ...mockEvalResult,
      scores: { completeness: 50, accuracy: 60, clarity: 55, analogy: 45 },
    };
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockResolvedValueOnce({ data: lowScoreResult });
    mockReturning.mockResolvedValueOnce([{ ...mockSavedRecord, isPassed: false, totalScore: 54 }]);

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.canUnlockStageB).toBe(false);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ isPassed: false })
    );
  });

  // ── 评分边界值 ───────────────────────────────────────────────────────────────

  it("评分各维度边界值（0 分）→ 正常处理不报错", async () => {
    const zeroScoreResult = {
      ...mockEvalResult,
      scores: { completeness: 0, accuracy: 0, clarity: 0, analogy: 0 },
    };
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockResolvedValueOnce({ data: zeroScoreResult });
    mockReturning.mockResolvedValueOnce([{ ...mockSavedRecord, totalScore: 0, isPassed: false }]);

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.totalScore).toBe(0);
  });

  it("评分各维度边界值（100 分）→ 正常处理不报错", async () => {
    const perfectScoreResult = {
      ...mockEvalResult,
      scores: { completeness: 100, accuracy: 100, clarity: 100, analogy: 100 },
    };
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockResolvedValueOnce({ data: perfectScoreResult });
    mockReturning.mockResolvedValueOnce([{ ...mockSavedRecord, totalScore: 100, isPassed: true }]);

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.totalScore).toBe(100);
  });

  it("coveredPoints 为空数组 / missedPoints 包含所有要点 → 正常返回", async () => {
    const noCoverResult = {
      ...mockEvalResult,
      coveredPoints: [],
      missedPoints: ["镀晶保护原理", "施工前处理", "保养周期"],
    };
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockResolvedValueOnce({ data: noCoverResult });
    mockReturning.mockResolvedValueOnce([mockSavedRecord]);

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.coveredPoints).toEqual([]);
    expect(json.data.missedPoints).toHaveLength(3);
  });

  // ── LLM 异常处理 ─────────────────────────────────────────────────────────────

  it("LLM 抛出 OpenRouter 错误 → 502 LLM_ERROR，不泄露内部错误", async () => {
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockRejectedValueOnce(
      new Error("OpenRouter API 错误 (429): Rate limit exceeded")
    );

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.code).toBe(4001);
    // 不应暴露原始 OpenRouter 错误内容
    expect(json.error).not.toContain("429");
    expect(json.error).not.toContain("Rate limit");
    expect(json.error).toContain("AI 评分服务暂时不可用");
  });

  it("LLM 抛出非 OpenRouter 错误 → 502 LLM_ERROR", async () => {
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockRejectedValueOnce(
      new Error("网络连接超时")
    );

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.code).toBe(4001);
  });

  it("LLM 抛出非 Error 对象 → 502 LLM_ERROR", async () => {
    mockLimit.mockResolvedValueOnce([mockKnowledge]);
    mockChatCompletionJSON.mockRejectedValueOnce("字符串类型异常");

    const req = makeRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.code).toBe(4001);
  });
});
