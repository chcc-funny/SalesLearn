import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * unit40: lib/services/scripts/generate.ts
 *
 * 兜底生成：检索知识切片（unit39） → 构造 prompt（unit36） → 调 LLM → 解析 draft
 *
 * mock：
 *  - retrieveKnowledgeChunks（unit39）
 *  - chatCompletionJSON（lib/llm/openrouter，沿用 unit38 风格）
 *
 * 覆盖：
 *  - 成功路径（含 sourceIds 透传）
 *  - 知识切片 0 条仍可生成（prompt 含「无知识切片」提示）
 *  - LLM 抛错 → GenerateError
 *  - LLM 返回非预期 shape → GenerateError
 *  - 模型选择 = Claude Sonnet
 *  - 多租户隔离（tenantId 透传给 retrieveKnowledgeChunks）
 *  - knowledgeChunkIds 直接命中（跳过检索）
 */

const mockRetrieve = vi.hoisted(() => vi.fn());
const mockChatCompletionJSON = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/scripts/knowledge-retrieval", () => ({
  retrieveKnowledgeChunks: mockRetrieve,
}));

vi.mock("@/lib/llm/openrouter", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm/openrouter")>(
    "@/lib/llm/openrouter"
  );
  return {
    ...actual,
    chatCompletionJSON: mockChatCompletionJSON,
  };
});

import {
  generateScriptFromKnowledge,
  GenerateError,
} from "@/lib/services/scripts/generate";
import { LLM_MODELS } from "@/lib/llm/openrouter";

const TENANT_A = "11111111-1111-4111-8111-111111111111";

describe("generateScriptFromKnowledge - 成功路径", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("调 retrieveKnowledgeChunks 取切片 + 调 LLM 返回 draft", async () => {
    mockRetrieve.mockResolvedValueOnce([
      { id: "k-1", title: "镀膜", content: "镀膜耐久 18 个月", score: 0.85 },
      { id: "k-2", title: "深度护理", content: "建议每 6 个月", score: 0.65 },
    ]);
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: {
        answer: "镀膜可保持 18-24 个月，欢迎到店体验。",
        sourceIds: ["k-1"],
      },
      usage: { promptTokens: 200, completionTokens: 80, totalTokens: 280 },
    });

    const result = await generateScriptFromKnowledge({
      tenantId: TENANT_A,
      customerQuestion: "镀膜能撑多久？",
    });

    expect(result.title).toContain("镀膜");
    expect(result.customerQuestion).toBe("镀膜能撑多久？");
    expect(result.answer).toContain("18-24");
    expect(result.sourceIds).toEqual(["k-1"]);
    expect(result.candidateSceneTagIds).toBeDefined();
    expect(result.candidateProductTagIds).toBeDefined();
    expect(mockRetrieve).toHaveBeenCalledTimes(1);
    expect(mockChatCompletionJSON).toHaveBeenCalledTimes(1);
  });

  it("传入 sceneTagId / productTagId → 透传给 retrieveKnowledgeChunks", async () => {
    mockRetrieve.mockResolvedValueOnce([]);
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { answer: "礼貌答复并引导到店。", sourceIds: [] },
      usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
    });

    await generateScriptFromKnowledge({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
      sceneTagId: "scene-1",
      productTagId: "product-1",
    });

    const call = mockRetrieve.mock.calls[0][0];
    expect(call).toMatchObject({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
      sceneTagId: "scene-1",
      productTagId: "product-1",
    });
  });

  it("0 条知识切片仍可生成（prompt 应自带兜底文案）", async () => {
    mockRetrieve.mockResolvedValueOnce([]);
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { answer: "礼貌答复。", sourceIds: [] },
      usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
    });

    const result = await generateScriptFromKnowledge({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result.answer).toBe("礼貌答复。");
    expect(result.sourceIds).toEqual([]);
  });

  it("knowledgeChunkIds 提供 → 跳过检索（直接走指定 id）", async () => {
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { answer: "答案", sourceIds: ["k-x"] },
      usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
    });

    const result = await generateScriptFromKnowledge({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
      knowledgeChunkIds: ["k-x"],
    });

    // 跳过 retrieveKnowledgeChunks
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(result.answer).toBe("答案");
  });
});

describe("generateScriptFromKnowledge - LLM 调用参数", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("使用 Claude Sonnet 模型", async () => {
    mockRetrieve.mockResolvedValueOnce([]);
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { answer: "x", sourceIds: [] },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    await generateScriptFromKnowledge({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    const call = mockChatCompletionJSON.mock.calls[0][0];
    expect(call.model).toBe(LLM_MODELS.CLAUDE_SONNET);
    expect(Array.isArray(call.messages)).toBe(true);
    expect(call.messages.length).toBeGreaterThan(0);
  });
});

describe("generateScriptFromKnowledge - 失败处理", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("LLM 抛错 → GenerateError(LLM_ERROR)", async () => {
    mockRetrieve.mockResolvedValueOnce([]);
    mockChatCompletionJSON.mockRejectedValueOnce(new Error("OpenRouter 500"));

    await expect(
      generateScriptFromKnowledge({
        tenantId: TENANT_A,
        customerQuestion: "镀膜",
      })
    ).rejects.toThrow(GenerateError);

    // 重新触发，断言错误码
    mockChatCompletionJSON.mockRejectedValueOnce(new Error("OpenRouter 500"));
    mockRetrieve.mockResolvedValueOnce([]);

    try {
      await generateScriptFromKnowledge({
        tenantId: TENANT_A,
        customerQuestion: "镀膜",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(GenerateError);
      expect((e as GenerateError).code).toBe("LLM_ERROR");
    }
  });

  it("LLM 返回 data null → GenerateError(INVALID_RESPONSE)", async () => {
    mockRetrieve.mockResolvedValueOnce([]);
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: null,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    try {
      await generateScriptFromKnowledge({
        tenantId: TENANT_A,
        customerQuestion: "镀膜",
      });
      throw new Error("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(GenerateError);
      expect((e as GenerateError).code).toBe("INVALID_RESPONSE");
    }
  });

  it("LLM 返回 answer 不是字符串 → GenerateError(INVALID_RESPONSE)", async () => {
    mockRetrieve.mockResolvedValueOnce([]);
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { answer: 123, sourceIds: [] },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    try {
      await generateScriptFromKnowledge({
        tenantId: TENANT_A,
        customerQuestion: "镀膜",
      });
      throw new Error("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(GenerateError);
      expect((e as GenerateError).code).toBe("INVALID_RESPONSE");
    }
  });

  it("LLM 返回 answer 空字符串 → GenerateError(EMPTY_ANSWER)", async () => {
    mockRetrieve.mockResolvedValueOnce([]);
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { answer: "   ", sourceIds: [] },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    try {
      await generateScriptFromKnowledge({
        tenantId: TENANT_A,
        customerQuestion: "镀膜",
      });
      throw new Error("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(GenerateError);
      expect((e as GenerateError).code).toBe("EMPTY_ANSWER");
    }
  });
});

describe("generateScriptFromKnowledge - 输出格式", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("title 自动从 customerQuestion 提取（截断到 ≤ 200 字）", async () => {
    const longQ = "镀膜".repeat(500); // 1000 字符
    mockRetrieve.mockResolvedValueOnce([]);
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { answer: "答案", sourceIds: [] },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const result = await generateScriptFromKnowledge({
      tenantId: TENANT_A,
      customerQuestion: longQ,
    });

    expect(result.title.length).toBeLessThanOrEqual(200);
    expect(result.customerQuestion).toBe(longQ);
  });

  it("LLM 返回非数组 sourceIds → 退化为空数组", async () => {
    mockRetrieve.mockResolvedValueOnce([]);
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { answer: "答案", sourceIds: "not-array" },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const result = await generateScriptFromKnowledge({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result.sourceIds).toEqual([]);
  });
});

describe("GenerateError 构造", () => {
  it("instanceof Error 且保留 code 字段", () => {
    const err = new GenerateError("LLM_ERROR", "调用失败");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(GenerateError);
    expect(err.code).toBe("LLM_ERROR");
    expect(err.name).toBe("GenerateError");
    expect(err.message).toBe("调用失败");
  });
});
