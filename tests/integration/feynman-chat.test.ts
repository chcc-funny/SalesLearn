import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ============================================================
// Hoisted mocks — must come before any imports of tested code
// ============================================================

const {
  mockUser,
  mockKnowledgeRow,
  mockFeynmanRecord,
  mockChatCompletionStream,
  makeTokenStream,
  mockDbSelect,
} = vi.hoisted(() => {
  // ── users ──────────────────────────────────────────────────
  const mockUser = {
    id: "user-0001",
    name: "员工用户",
    email: "employee@example.com",
    role: "employee",
    tenantId: "tenant-0001",
  };

  // ── knowledge fixture ───────────────────────────────────────
  const mockKnowledgeRow = {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    tenantId: "tenant-0001",
    title: "隐形车衣",
    content: "隐形车衣（PPF）是一种高透明聚氨酯薄膜，贴在车身外表面以防止石子划伤。",
    keyPoints: ["防石击", "自修复", "高透明度"],
    examples: "可以用手机屏幕贴膜来类比",
    commonMistakes: "不是变色龙膜",
    status: "published",
  };

  // ── feynman stage-A record fixture ──────────────────────────
  const mockFeynmanRecord = { totalScore: 85 };

  // ── LLM stream mock ─────────────────────────────────────────
  const mockChatCompletionStream = vi.fn();

  /**
   * Build a ReadableStream that emits the given tokens (UTF-8 text chunks).
   * Simulates what chatCompletionStream returns after SSE parsing.
   */
  function makeTokenStream(tokens: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const token of tokens) {
          controller.enqueue(encoder.encode(token));
        }
        controller.close();
      },
    });
  }

  /**
   * Drizzle query builder mock.
   *
   * Both queries in the route use the pattern:
   *   db.select([fields]).from(table).where(cond)[.orderBy(col)].limit(1)
   *
   * We intercept at the `limit()` level so the chain always resolves.
   * The mock tracks how many times `select` has been called and returns
   * the matching pre-configured result.
   *
   * wireSelect(row1, row2) sets:
   *   - 1st select → limit() resolves to [row1]  (fetchPublishedKnowledge)
   *   - 2nd select → limit() resolves to [row2]  (hasPassedStageA)
   */
  const mockDbSelect = vi.fn();

  return {
    mockUser,
    mockKnowledgeRow,
    mockFeynmanRecord,
    mockChatCompletionStream,
    makeTokenStream,
    mockDbSelect,
  };
});

// ── current session user (mutable per test) ─────────────────
let currentUser = mockUser;

// ============================================================
// Module mocks
// ============================================================

vi.mock("@/lib/db", () => ({
  db: { select: mockDbSelect },
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

vi.mock("@/lib/llm/openrouter", () => ({
  chatCompletionStream: mockChatCompletionStream,
  LLM_MODELS: {
    CLAUDE_SONNET: "anthropic/claude-sonnet-4",
    CLAUDE_HAIKU: "anthropic/claude-haiku-4.5",
    KIMI_K2: "moonshotai/kimi-k2.6",
  },
}));

// ── Import the route AFTER mocks are registered ─────────────
import { POST } from "@/app/api/feynman/chat/route";

// ============================================================
// Test helpers
// ============================================================

const VALID_KNOWLEDGE_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/feynman/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

function makeValidBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    knowledgeId: VALID_KNOWLEDGE_ID,
    persona: "beginner",
    chatHistory: [],
    userMessage: "这个车衣有什么用？",
    ...overrides,
  };
}

/** Read all bytes from a ReadableStream and decode to string. */
async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value);
  }
  return result;
}

/**
 * Build a Drizzle-like query builder chain mock that resolves to `rows`
 * when `.limit()` is called.
 *
 * Supports both chains used in the route:
 *   .from().where().limit(1)                   (fetchPublishedKnowledge)
 *   .from().where().orderBy().limit(1)          (hasPassedStageA)
 */
function makeSelectChain(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn, orderBy: orderByFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

/**
 * Set up db.select mock for a full happy-path call sequence:
 *   1st call → knowledge chain  (knowledgeRows)
 *   2nd call → feynman chain    (feynmanRows)
 */
function wireDb(knowledgeRows: unknown[], feynmanRows: unknown[]) {
  mockDbSelect
    .mockReturnValueOnce(makeSelectChain(knowledgeRows))
    .mockReturnValueOnce(makeSelectChain(feynmanRows));
}

function wireDbKnowledgeFound_Unlocked() {
  wireDb([mockKnowledgeRow], [mockFeynmanRecord]);
}

function wireDbKnowledgeFound_NotUnlocked() {
  wireDb([mockKnowledgeRow], []); // empty → totalScore undefined → < 80 → locked
}

function wireDbKnowledgeNotFound() {
  wireDb([], []); // no knowledge row → 404 (feynman chain never reached)
}

// ============================================================
// Tests
// ============================================================

describe("POST /api/feynman/chat", () => {
  beforeEach(() => {
    // resetAllMocks clears both call records AND mockReturnValueOnce queues,
    // preventing leftover queued returns from validation-only tests leaking
    // into DB-dependent tests.
    vi.resetAllMocks();
    currentUser = mockUser;

    // Default happy-path SSE stream
    const encoder = new TextEncoder();
    mockChatCompletionStream.mockResolvedValue(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("你好，请问车衣是什么？"));
          controller.enqueue(
            encoder.encode(
              '<!--META:{"isConvinced":false,"roundNumber":1,"isComplete":false}-->'
            )
          );
          controller.close();
        },
      })
    );
  });

  // ── 1. 未登录返回 401 ────────────────────────────────────────

  it("未登录时返回 401 UNAUTHORIZED", async () => {
    currentUser = null as unknown as typeof mockUser;

    const req = makePostRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.code).toBe(2001);
  });

  // ── 2. Zod 校验：chatHistory 超长 ───────────────────────────

  it("chatHistory 超过 10 条时返回 400 VALIDATION_ERROR", async () => {
    const tooLongHistory = Array.from({ length: 11 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "ai",
      content: `消息 ${i}`,
    }));

    const req = makePostRequest(makeValidBody({ chatHistory: tooLongHistory }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
    expect(json.error).toMatch(/超出限制/);
  });

  // ── 3. Zod 校验：userMessage 超长 ───────────────────────────

  it("userMessage 超过 2000 字符时返回 400 VALIDATION_ERROR", async () => {
    const req = makePostRequest(makeValidBody({ userMessage: "x".repeat(2001) }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
    expect(json.error).toMatch(/消息过长/);
  });

  // ── 4. Zod 校验：persona 枚举非法值 ─────────────────────────

  it("persona 为非枚举值时返回 400 VALIDATION_ERROR", async () => {
    const req = makePostRequest(makeValidBody({ persona: "unknown_persona" }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  // ── 5. Zod 校验：knowledgeId 非 UUID ────────────────────────

  it("knowledgeId 非 UUID 格式时返回 400 VALIDATION_ERROR", async () => {
    const req = makePostRequest(makeValidBody({ knowledgeId: "not-a-uuid" }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  // ── 6. 知识点不存在 → 404 ────────────────────────────────────

  it("知识点不存在或未发布时返回 404", async () => {
    wireDbKnowledgeNotFound();

    const req = makePostRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1002);
  });

  // ── 7. Stage A 未解锁 → 403 ─────────────────────────────────

  it("Stage A 未通过（score < 80）时返回 403 FORBIDDEN", async () => {
    wireDbKnowledgeFound_NotUnlocked();

    const req = makePostRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.code).toBe(2002);
    expect(json.error).toMatch(/阶段 A/);
  });

  // ── 8. 正常流程：SSE 响应格式 ───────────────────────────────

  it("正常请求返回 SSE 流，Content-Type 为 text/event-stream", async () => {
    wireDbKnowledgeFound_Unlocked();

    const req = makePostRequest(makeValidBody());
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  // ── 9. 流内容可读取且包含 META 标记 ─────────────────────────

  it("SSE 流中可读取 token 且末尾含 META 标记", async () => {
    wireDbKnowledgeFound_Unlocked();

    const req = makePostRequest(makeValidBody());
    const res = await POST(req);

    expect(res.body).not.toBeNull();
    const text = await readStream(res.body!);

    expect(text).toContain("车衣");
    expect(text).toMatch(/<!--META:.*-->/);
  });

  // ── 10. chatHistory role 转换（ai → assistant）──────────────

  it("chatHistory 中 role='ai' 被正确转换为 'assistant' 传给 LLM", async () => {
    wireDbKnowledgeFound_Unlocked();

    const historyWithAiRole = [
      { role: "ai", content: "你好，请问有什么需要？" },
      { role: "user", content: "我想了解车衣" },
    ];

    const req = makePostRequest(makeValidBody({ chatHistory: historyWithAiRole }));
    await POST(req);

    expect(mockChatCompletionStream).toHaveBeenCalledOnce();
    const callArgs = mockChatCompletionStream.mock.calls[0][0];
    const messages: Array<{ role: string; content: string }> = callArgs.messages;

    const historyMessages = messages.filter(
      (m) => m.role === "user" || m.role === "assistant"
    );
    expect(historyMessages[0]).toMatchObject({
      role: "assistant",
      content: "你好，请问有什么需要？",
    });
    expect(historyMessages[1]).toMatchObject({
      role: "user",
      content: "我想了解车衣",
    });
  });

  // ── 11. system prompt 构建正确传给 LLM ─────────────────────

  it("LLM 接收到包含 persona 和知识内容的 system prompt", async () => {
    wireDbKnowledgeFound_Unlocked();

    const req = makePostRequest(makeValidBody({ persona: "expert" }));
    await POST(req);

    expect(mockChatCompletionStream).toHaveBeenCalledOnce();
    const callArgs = mockChatCompletionStream.mock.calls[0][0];
    const messages: Array<{ role: string; content: string }> = callArgs.messages;

    const systemMsg = messages.find((m) => m.role === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toContain("隐形车衣");
    expect(systemMsg!.content).toContain("懂车型");
  });

  // ── 12. userMessage='__START__' 时不追加 user message ──────

  it("userMessage='__START__' 时不追加 user turn 到 LLM messages", async () => {
    wireDbKnowledgeFound_Unlocked();

    const req = makePostRequest(makeValidBody({ userMessage: "__START__" }));
    await POST(req);

    const callArgs = mockChatCompletionStream.mock.calls[0][0];
    const messages: Array<{ role: string; content: string }> = callArgs.messages;

    const userMessages = messages.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(0);
  });

  // ── 13. 普通 userMessage 包装后追加到 LLM messages ─────────

  it("普通 userMessage 被包装后作为最后一条 user message 传给 LLM", async () => {
    wireDbKnowledgeFound_Unlocked();

    const req = makePostRequest(
      makeValidBody({ userMessage: "这个能防石击吗？", chatHistory: [] })
    );
    await POST(req);

    const callArgs = mockChatCompletionStream.mock.calls[0][0];
    const messages: Array<{ role: string; content: string }> = callArgs.messages;

    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe("user");
    expect(lastMsg.content).toContain("这个能防石击吗？");
    // buildChatUserPrompt wraps with [员工回复]
    expect(lastMsg.content).toMatch(/\[员工回复\]/);
  });

  // ── 14. LLM 流抛出 OpenRouter 错误 → 返回友好错误 ───────────

  it("LLM 流抛出 OpenRouter 错误时返回 502 并不泄露内部信息", async () => {
    wireDbKnowledgeFound_Unlocked();

    mockChatCompletionStream.mockRejectedValueOnce(
      new Error("OpenRouter API 错误 (500): internal server error")
    );

    const req = makePostRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.code).toBe(4001);
    expect(json.error).not.toContain("internal server error");
    expect(json.error).toContain("AI 对话服务暂时不可用");
  });

  // ── 15. LLM 流抛出非 OpenRouter 错误 → 通用错误 ────────────

  it("LLM 流抛出非 OpenRouter 错误时返回通用对话失败提示", async () => {
    wireDbKnowledgeFound_Unlocked();

    mockChatCompletionStream.mockRejectedValueOnce(
      new Error("unexpected internal failure")
    );

    const req = makePostRequest(makeValidBody());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.error).toBe("对话请求失败");
  });

  // ── 16. LLM 调用参数包含 temperature=0.8 和 CLAUDE_SONNET ──

  it("LLM 调用时使用 temperature=0.8 和 CLAUDE_SONNET 模型", async () => {
    wireDbKnowledgeFound_Unlocked();

    const req = makePostRequest(makeValidBody());
    await POST(req);

    const callArgs = mockChatCompletionStream.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.8);
    expect(callArgs.model).toBe("anthropic/claude-sonnet-4");
  });

  // ── 17. chatHistory role='user' 保持不变 ───────────────────

  it("chatHistory 中 role='user' 保持不变传给 LLM", async () => {
    wireDbKnowledgeFound_Unlocked();

    const historyWithUserRole = [
      { role: "user", content: "我想了解车衣" },
    ];

    const req = makePostRequest(makeValidBody({ chatHistory: historyWithUserRole }));
    await POST(req);

    const callArgs = mockChatCompletionStream.mock.calls[0][0];
    const messages: Array<{ role: string; content: string }> = callArgs.messages;

    const userHistoryMsg = messages.find(
      (m) => m.role === "user" && m.content === "我想了解车衣"
    );
    expect(userHistoryMsg).toBeDefined();
  });
});
