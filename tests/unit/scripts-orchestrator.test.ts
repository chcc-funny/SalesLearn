import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * unit41: lib/services/scripts/orchestrator.ts
 *
 * 综合编排：trgm 候选 → 重排 → 阈值命中 / 兜底生成
 *
 * mock 三个下游：
 *  - searchScriptCandidates（unit37）
 *  - rerankScripts（unit38）
 *  - generateScriptFromKnowledge（unit40）
 *
 * 覆盖路径：
 *  1. 候选 ≥ 3 → rerank → top-3，source = 'curated'
 *  2. 候选 < 3 → 走 generate 兜底，source = 'mixed' 或 'generated'
 *  3. 0 候选 → 仅 generate，source = 'generated'
 *  4. rerank 降级（degraded=true）→ 仍返回 top-3，附 degraded 标志
 *  5. generate 失败 → 仅返回已有候选（如有），source 标 'curated' 或 'empty'
 *  6. 多租户隔离：tenantId 透传到所有下游
 */

const mockSearch = vi.hoisted(() => vi.fn());
const mockRerank = vi.hoisted(() => vi.fn());
const mockGenerate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/scripts/fulltext-search", () => ({
  searchScriptCandidates: mockSearch,
}));

vi.mock("@/lib/services/scripts/rerank", () => ({
  rerankScripts: mockRerank,
}));

vi.mock("@/lib/services/scripts/generate", async () => {
  // 复刻 GenerateError 类，便于测试触发降级路径
  class GenerateError extends Error {
    public readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "GenerateError";
      this.code = code;
      Object.setPrototypeOf(this, GenerateError.prototype);
    }
  }
  return {
    generateScriptFromKnowledge: mockGenerate,
    GenerateError,
  };
});

import { searchOrGenerateScripts } from "@/lib/services/scripts/orchestrator";

const TENANT_A = "11111111-1111-4111-8111-111111111111";

const candidate = (id: string, score: number) => ({
  id,
  title: `t-${id}`,
  customerQuestion: `q-${id}`,
  answer: `a-${id}`,
  score,
});

describe("searchOrGenerateScripts - 候选充足（≥ 3）走精选路径", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("候选 ≥ 3 → rerank → 返回 top-3，source='curated'，不调 generate", async () => {
    mockSearch.mockResolvedValueOnce([
      candidate("s-1", 0.5),
      candidate("s-2", 0.6),
      candidate("s-3", 0.4),
      candidate("s-4", 0.3),
    ]);
    mockRerank.mockResolvedValueOnce({
      items: [
        { ...candidate("s-2", 0.95) },
        { ...candidate("s-1", 0.8) },
        { ...candidate("s-3", 0.7) },
        { ...candidate("s-4", 0.4) },
      ],
      degraded: false,
    });

    const result = await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result.source).toBe("curated");
    expect(result.items).toHaveLength(3);
    expect(result.items.map((i) => i.id)).toEqual(["s-2", "s-1", "s-3"]);
    expect(mockRerank).toHaveBeenCalledTimes(1);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("候选恰好 = 3 → rerank → 返回 3 条", async () => {
    mockSearch.mockResolvedValueOnce([
      candidate("s-1", 0.5),
      candidate("s-2", 0.6),
      candidate("s-3", 0.4),
    ]);
    mockRerank.mockResolvedValueOnce({
      items: [
        { ...candidate("s-1", 0.9) },
        { ...candidate("s-2", 0.8) },
        { ...candidate("s-3", 0.5) },
      ],
      degraded: false,
    });

    const result = await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result.source).toBe("curated");
    expect(result.items).toHaveLength(3);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("rerank 降级（degraded=true）→ items 仍按原顺序前 3 + degraded 标记透传", async () => {
    mockSearch.mockResolvedValueOnce([
      candidate("s-1", 0.5),
      candidate("s-2", 0.6),
      candidate("s-3", 0.4),
    ]);
    mockRerank.mockResolvedValueOnce({
      items: [candidate("s-1", 0.5), candidate("s-2", 0.6), candidate("s-3", 0.4)],
      degraded: true,
      error: "OpenRouter timeout",
    });

    const result = await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result.source).toBe("curated");
    expect(result.items).toHaveLength(3);
    expect(result.degraded).toBe(true);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("searchOrGenerateScripts - 候选不足（< 3）走兜底", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("候选 = 2 → 走 generate → 'mixed'，items 含 2 条原 + 1 条 draft", async () => {
    mockSearch.mockResolvedValueOnce([
      candidate("s-1", 0.5),
      candidate("s-2", 0.6),
    ]);
    mockGenerate.mockResolvedValueOnce({
      title: "t-draft",
      customerQuestion: "镀膜",
      answer: "a-draft",
      sourceIds: ["k-1"],
      candidateSceneTagIds: [],
      candidateProductTagIds: [],
    });

    const result = await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result.source).toBe("mixed");
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    // generated draft 也在 items 内（含 isGenerated 标志或类似）
    const generated = result.items.find((i) => i.isGenerated);
    expect(generated).toBeDefined();
    expect(generated?.answer).toBe("a-draft");
    expect(mockRerank).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("候选 = 1 → 走 generate → 'mixed'", async () => {
    mockSearch.mockResolvedValueOnce([candidate("s-1", 0.5)]);
    mockGenerate.mockResolvedValueOnce({
      title: "t-draft",
      customerQuestion: "镀膜",
      answer: "a-draft",
      sourceIds: [],
      candidateSceneTagIds: [],
      candidateProductTagIds: [],
    });

    const result = await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result.source).toBe("mixed");
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it("候选 = 0 → 走 generate → 'generated'，items 仅 1 条 draft", async () => {
    mockSearch.mockResolvedValueOnce([]);
    mockGenerate.mockResolvedValueOnce({
      title: "t-draft",
      customerQuestion: "镀膜",
      answer: "a-draft",
      sourceIds: [],
      candidateSceneTagIds: [],
      candidateProductTagIds: [],
    });

    const result = await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result.source).toBe("generated");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].isGenerated).toBe(true);
  });
});

describe("searchOrGenerateScripts - 兜底失败的容错", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("候选 = 0 + generate 失败 → source='empty'，items=[]", async () => {
    mockSearch.mockResolvedValueOnce([]);
    mockGenerate.mockRejectedValueOnce(new Error("OpenRouter 500"));

    const result = await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result.source).toBe("empty");
    expect(result.items).toEqual([]);
    expect(result.generateError).toBeDefined();
  });

  it("候选 = 2 + generate 失败 → source='curated'，items 仅含原候选", async () => {
    mockSearch.mockResolvedValueOnce([
      candidate("s-1", 0.5),
      candidate("s-2", 0.6),
    ]);
    mockGenerate.mockRejectedValueOnce(new Error("OpenRouter 500"));

    const result = await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result.source).toBe("curated");
    expect(result.items.map((i) => i.id)).toEqual(["s-1", "s-2"]);
    expect(result.generateError).toBeDefined();
  });
});

describe("searchOrGenerateScripts - 参数透传", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tenantId / customerQuestion / 标签透传给 search", async () => {
    mockSearch.mockResolvedValueOnce([]);
    mockGenerate.mockResolvedValueOnce({
      title: "t",
      customerQuestion: "镀膜",
      answer: "a",
      sourceIds: [],
      candidateSceneTagIds: [],
      candidateProductTagIds: [],
    });

    await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
      sceneTagId: "scene-1",
      productTagId: "product-1",
    });

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        query: "镀膜",
        sceneTagId: "scene-1",
        productTagId: "product-1",
      })
    );
  });

  it("tenantId / customerQuestion / 标签透传给 generate", async () => {
    mockSearch.mockResolvedValueOnce([]);
    mockGenerate.mockResolvedValueOnce({
      title: "t",
      customerQuestion: "镀膜",
      answer: "a",
      sourceIds: [],
      candidateSceneTagIds: [],
      candidateProductTagIds: [],
    });

    await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
      sceneTagId: "scene-1",
      productTagId: "product-1",
    });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        customerQuestion: "镀膜",
        sceneTagId: "scene-1",
        productTagId: "product-1",
      })
    );
  });

  it("跨租户：不同 tenantId 独立调用，互不影响", async () => {
    const TENANT_B = "22222222-2222-4222-8222-222222222222";
    mockSearch.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockGenerate.mockResolvedValueOnce({
      title: "tA",
      customerQuestion: "镀膜",
      answer: "aA",
      sourceIds: [],
      candidateSceneTagIds: [],
      candidateProductTagIds: [],
    });
    mockGenerate.mockResolvedValueOnce({
      title: "tB",
      customerQuestion: "镀膜",
      answer: "aB",
      sourceIds: [],
      candidateSceneTagIds: [],
      candidateProductTagIds: [],
    });

    const a = await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });
    const b = await searchOrGenerateScripts({
      tenantId: TENANT_B,
      customerQuestion: "镀膜",
    });

    expect(a.items[0].answer).toBe("aA");
    expect(b.items[0].answer).toBe("aB");
    expect(mockSearch.mock.calls[0][0].tenantId).toBe(TENANT_A);
    expect(mockSearch.mock.calls[1][0].tenantId).toBe(TENANT_B);
  });
});

describe("searchOrGenerateScripts - 边界", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("空 customerQuestion → 直接返回 source='empty'，不调任何下游", async () => {
    const result = await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "",
    });

    expect(result.source).toBe("empty");
    expect(result.items).toEqual([]);
    expect(mockSearch).not.toHaveBeenCalled();
    expect(mockRerank).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("纯空白 customerQuestion → 'empty'", async () => {
    const result = await searchOrGenerateScripts({
      tenantId: TENANT_A,
      customerQuestion: "  \n\t",
    });

    expect(result.source).toBe("empty");
    expect(result.items).toEqual([]);
  });
});
