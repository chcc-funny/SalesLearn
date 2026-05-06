import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock db before importing processFileWithAI
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(),
  },
}));

// Mock openrouter before importing the module under test
vi.mock("@/lib/llm/openrouter", () => ({
  chatCompletionJSON: vi.fn(),
  LLM_MODELS: {
    KIMI_K2: "moonshotai/kimi-k2.6",
    CLAUDE_SONNET: "anthropic/claude-sonnet-4",
    CLAUDE_HAIKU: "anthropic/claude-haiku-4.5",
  },
}));

// Mock the schema
vi.mock("@/lib/db/schema", () => ({
  knowledgeBase: "knowledgeBase_table",
}));

import { processFileWithAI } from "@/lib/llm/split-knowledge";
import { chatCompletionJSON } from "@/lib/llm/openrouter";
import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const makeSamplePoint = (overrides = {}) => ({
  title: "隔热膜基础知识",
  category: "product",
  key_points: ["高隔热率", "防紫外线"],
  content: "隔热膜能有效降低车内温度...",
  examples: "客户问：贴了有用吗？销售答：当然有用...",
  common_mistakes: "不要混淆隔热率和透光率",
  ...overrides,
});

const makeDbChain = (ids: string[]) => ({
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue(ids.map((id) => ({ id }))),
});

const baseParams = {
  fileUrl: "https://example.com/file.pdf",
  fileName: "培训资料.pdf",
  fileContent: "这是一份关于隔热膜的培训资料...",
  tenantId: "tenant-001",
  createdBy: "user-001",
};

// ─────────────────────────────────────────────────────────────
// processFileWithAI
// ─────────────────────────────────────────────────────────────

describe("processFileWithAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: 返回知识点 ID 列表", async () => {
    const point = makeSamplePoint();
    vi.mocked(chatCompletionJSON).mockResolvedValue({
      data: { knowledge_points: [point] },
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    });

    const chain = makeDbChain(["id-001"]);
    vi.mocked(db.insert).mockReturnValue(chain as ReturnType<typeof db.insert>);

    const ids = await processFileWithAI(baseParams);

    expect(ids).toEqual(["id-001"]);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("调用 chatCompletionJSON 时传入 SPLIT_SYSTEM_PROMPT", async () => {
    vi.mocked(chatCompletionJSON).mockResolvedValue({
      data: { knowledge_points: [makeSamplePoint()] },
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });
    const chain = makeDbChain(["id-001"]);
    vi.mocked(db.insert).mockReturnValue(chain as ReturnType<typeof db.insert>);

    await processFileWithAI(baseParams);

    const call = vi.mocked(chatCompletionJSON).mock.calls[0][0];
    expect(call.messages[0].role).toBe("system");
    expect(call.messages[0].content).toContain("知识点");
    expect(call.messages[1].role).toBe("user");
    expect(call.messages[1].content).toContain(baseParams.fileName);
  });

  it("无效 category 时回退到默认 'product'", async () => {
    const badCategoryPoint = makeSamplePoint({ category: "invalid-cat" });
    vi.mocked(chatCompletionJSON).mockResolvedValue({
      data: { knowledge_points: [badCategoryPoint] },
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    let capturedRows: Record<string, unknown>[] = [];
    const chain = {
      values: vi.fn((rows) => {
        capturedRows = rows;
        return chain;
      }),
      returning: vi.fn().mockResolvedValue([{ id: "id-xyz" }]),
    };
    vi.mocked(db.insert).mockReturnValue(chain as ReturnType<typeof db.insert>);

    await processFileWithAI(baseParams);

    expect(capturedRows[0].category).toBe("product");
  });

  it("LLM 返回空数组时抛出错误", async () => {
    vi.mocked(chatCompletionJSON).mockResolvedValue({
      data: { knowledge_points: [] },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    await expect(processFileWithAI(baseParams)).rejects.toThrow("AI 未能从文件中提取到知识点");
  });

  it("LLM 调用失败时错误冒泡", async () => {
    vi.mocked(chatCompletionJSON).mockRejectedValue(new Error("LLM timeout"));

    await expect(processFileWithAI(baseParams)).rejects.toThrow("LLM timeout");
  });

  it("支持自定义 category 参数", async () => {
    vi.mocked(chatCompletionJSON).mockResolvedValue({
      data: { knowledge_points: [makeSamplePoint()] },
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });
    const chain = makeDbChain(["id-001"]);
    vi.mocked(db.insert).mockReturnValue(chain as ReturnType<typeof db.insert>);

    await processFileWithAI({ ...baseParams, category: "objection" });

    const call = vi.mocked(chatCompletionJSON).mock.calls[0][0];
    expect(call.messages[1].content).toContain("objection");
  });
});
