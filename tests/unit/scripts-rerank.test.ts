import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * unit38: lib/services/scripts/rerank.ts
 *
 * mock chatCompletionJSON：
 *  - 成功路径：LLM 返回 { scores: [{ id, score, reason }] } → 重排后返回（按 score 降序）
 *  - 失败：LLM 抛错 → 回退原顺序，附带 degraded:true 标志
 *  - 候选为空 → 直接返回空数组（不调 LLM）
 *  - 单一候选 → 直接返回（不调 LLM）
 *  - 模型选择：Kimi K2（OpenRouter 路由）
 */

const mockChatCompletionJSON = vi.hoisted(() => vi.fn());

vi.mock("@/lib/llm/openrouter", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm/openrouter")>(
    "@/lib/llm/openrouter"
  );
  return {
    ...actual,
    chatCompletionJSON: mockChatCompletionJSON,
  };
});

import { rerankScripts } from "@/lib/services/scripts/rerank";
import { LLM_MODELS } from "@/lib/llm/openrouter";

const candidates = [
  {
    id: "s-1",
    title: "镀膜耐久度",
    customerQuestion: "镀膜能撑多久？",
    answer: "18-24 个月。",
    score: 0.5,
  },
  {
    id: "s-2",
    title: "深度护理",
    customerQuestion: "深度护理频率？",
    answer: "每 6 个月。",
    score: 0.7,
  },
  {
    id: "s-3",
    title: "贴膜质保",
    customerQuestion: "贴膜质保多少年？",
    answer: "10 年。",
    score: 0.4,
  },
];

describe("rerankScripts - 边界（不调 LLM）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("候选为空 → 返回空数组，不调 LLM", async () => {
    const result = await rerankScripts({
      candidates: [],
      customerQuestion: "镀膜",
    });
    expect(result.items).toEqual([]);
    expect(result.degraded).toBe(false);
    expect(mockChatCompletionJSON).not.toHaveBeenCalled();
  });

  it("单一候选 → 直接返回，不调 LLM", async () => {
    const single = [candidates[0]];
    const result = await rerankScripts({
      candidates: single,
      customerQuestion: "镀膜",
    });
    expect(result.items).toEqual(single);
    expect(result.degraded).toBe(false);
    expect(mockChatCompletionJSON).not.toHaveBeenCalled();
  });
});

describe("rerankScripts - 成功路径", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("LLM 返回评分后按新分数降序", async () => {
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: {
        scores: [
          { id: "s-3", score: 0.95, reason: "贴膜与镀膜接近" },
          { id: "s-1", score: 0.8, reason: "直接命中" },
          { id: "s-2", score: 0.3, reason: "弱相关" },
        ],
      },
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const result = await rerankScripts({
      candidates,
      customerQuestion: "镀膜",
    });

    expect(result.degraded).toBe(false);
    expect(result.items.map((i) => i.id)).toEqual(["s-3", "s-1", "s-2"]);
    // 重排后的 score 来自 LLM
    expect(result.items[0].score).toBe(0.95);
    expect(result.items[1].score).toBe(0.8);
  });

  it("LLM 评分缺失部分候选 → 缺失的候选保留原顺序追加，且 score 退化为原 score", async () => {
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: {
        scores: [{ id: "s-2", score: 0.9, reason: "命中" }],
      },
      usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
    });

    const result = await rerankScripts({
      candidates,
      customerQuestion: "镀膜",
    });

    expect(result.degraded).toBe(false);
    // s-2 排首位，其余按原数组顺序追加
    expect(result.items[0].id).toBe("s-2");
    // 剩余两条按原顺序（s-1, s-3）
    expect(result.items.slice(1).map((i) => i.id)).toEqual(["s-1", "s-3"]);
  });

  it("传 scene/product 时透传到 prompt（参数透传校验）", async () => {
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { scores: [] },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    await rerankScripts({
      candidates,
      customerQuestion: "镀膜",
      scene: "进店问询",
      product: "镀膜",
    });

    const call = mockChatCompletionJSON.mock.calls[0][0];
    expect(call.model).toBe(LLM_MODELS.KIMI_K2);
    // messages 至少有一个 user 消息
    expect(Array.isArray(call.messages)).toBe(true);
    expect(call.messages.length).toBeGreaterThan(0);
    // 找到含「进店问询」与「镀膜」的 prompt
    const text = call.messages.map((m: { content: string }) => m.content).join("\n");
    expect(text).toContain("进店问询");
    expect(text).toContain("镀膜");
  });

  it("LLM 返回评分超出 [0,1] 范围 → clamp", async () => {
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: {
        scores: [
          { id: "s-1", score: 1.5, reason: "超出上界" },
          { id: "s-2", score: -0.3, reason: "负数" },
        ],
      },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const result = await rerankScripts({
      candidates: candidates.slice(0, 2),
      customerQuestion: "镀膜",
    });

    expect(result.items[0].score).toBe(1);
    expect(result.items[1].score).toBe(0);
  });
});

describe("rerankScripts - 降级", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("LLM 抛错 → 回退原顺序，degraded=true", async () => {
    mockChatCompletionJSON.mockRejectedValueOnce(new Error("OpenRouter timeout"));

    const result = await rerankScripts({
      candidates,
      customerQuestion: "镀膜",
    });

    expect(result.degraded).toBe(true);
    // 顺序与原候选一致
    expect(result.items.map((i) => i.id)).toEqual(["s-1", "s-2", "s-3"]);
    expect(result.error).toContain("OpenRouter timeout");
  });

  it("LLM 返回非数组 scores → 退化为 degraded", async () => {
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { scores: "not an array" },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const result = await rerankScripts({
      candidates,
      customerQuestion: "镀膜",
    });

    expect(result.degraded).toBe(true);
    expect(result.items.map((i) => i.id)).toEqual(["s-1", "s-2", "s-3"]);
  });

  it("LLM 返回 data 为 null → 退化", async () => {
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: null,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const result = await rerankScripts({
      candidates,
      customerQuestion: "镀膜",
    });

    expect(result.degraded).toBe(true);
  });
});

describe("rerankScripts - LLM 调用参数", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("使用 Kimi K2 模型", async () => {
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { scores: [] },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    await rerankScripts({ candidates, customerQuestion: "镀膜" });
    const call = mockChatCompletionJSON.mock.calls[0][0];
    expect(call.model).toBe(LLM_MODELS.KIMI_K2);
  });

  it("temperature 设置为低值（确定性输出）", async () => {
    mockChatCompletionJSON.mockResolvedValueOnce({
      data: { scores: [] },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    await rerankScripts({ candidates, customerQuestion: "镀膜" });
    const call = mockChatCompletionJSON.mock.calls[0][0];
    expect(call.temperature).toBeLessThanOrEqual(0.3);
  });
});
