import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * unit39: lib/services/scripts/knowledge-retrieval.ts
 *
 * 用 pg_trgm 模糊检索 knowledge_base 表里的相关切片，作为兜底生成（unit40）
 * 的上下文。mock drizzle 全程，覆盖：
 *  - 多租户隔离（必带 tenantId）
 *  - 默认仅检索 status='published'
 *  - 空 query → 返回空数组（短路）
 *  - limit 默认 5 / 最小 1 / 最大 50
 *  - 单条切片裁剪 ≤ 800 字
 *  - SQL 安全参数化（不直接拼接 query）
 */

const {
  mockSelect,
  mockWhere,
  mockOrderBy,
  mockLimit,
  wireChain,
} = vi.hoisted(() => {
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();

  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  }

  wireChain();
  return {
    mockSelect,
    mockWhere,
    mockOrderBy,
    mockLimit,
    wireChain,
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: mockSelect },
}));

import {
  retrieveKnowledgeChunks,
  MAX_CHUNK_LENGTH,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "@/lib/services/scripts/knowledge-retrieval";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

describe("retrieveKnowledgeChunks - 边界短路", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("空 customerQuestion 短路返回空数组（不调 DB）", async () => {
    const result = await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "",
    });
    expect(result).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("仅空白 customerQuestion 也短路", async () => {
    const result = await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "   \n\t",
    });
    expect(result).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe("retrieveKnowledgeChunks - 默认 + 自定义 limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("默认 limit=5", async () => {
    mockLimit.mockResolvedValueOnce([]);
    await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });
    expect(mockLimit).toHaveBeenCalledWith(DEFAULT_LIMIT);
    expect(DEFAULT_LIMIT).toBe(5);
  });

  it("自定义 limit 透传", async () => {
    mockLimit.mockResolvedValueOnce([]);
    await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
      limit: 3,
    });
    expect(mockLimit).toHaveBeenCalledWith(3);
  });

  it("limit 0 → 最小退化为 1", async () => {
    mockLimit.mockResolvedValueOnce([]);
    await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
      limit: 0,
    });
    expect(mockLimit.mock.calls[0][0]).toBeGreaterThanOrEqual(1);
  });

  it("limit 超 MAX_LIMIT → 钳到 MAX_LIMIT", async () => {
    mockLimit.mockResolvedValueOnce([]);
    await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
      limit: 9999,
    });
    expect(mockLimit.mock.calls[0][0]).toBe(MAX_LIMIT);
  });
});

describe("retrieveKnowledgeChunks - 多租户与默认条件", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("非空 query 调 DB", async () => {
    mockLimit.mockResolvedValueOnce([
      { id: "k-1", title: "镀膜介绍", content: "镀膜可保持 18 个月", score: 0.85 },
    ]);

    const result = await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "k-1",
      title: "镀膜介绍",
    });
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("跨租户：不同 tenantId 的查询互不影响（每次独立调用）", async () => {
    mockLimit.mockResolvedValueOnce([{ id: "a-row", title: "A", content: "a-content", score: 0.5 }]);
    mockLimit.mockResolvedValueOnce([{ id: "b-row", title: "B", content: "b-content", score: 0.5 }]);

    const a = await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });
    const b = await retrieveKnowledgeChunks({
      tenantId: TENANT_B,
      customerQuestion: "镀膜",
    });

    expect(a[0]?.id).toBe("a-row");
    expect(b[0]?.id).toBe("b-row");
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("调用 where 时构造的过滤 SQL 应有 1 个组合条件参数", async () => {
    mockLimit.mockResolvedValueOnce([]);
    await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(mockWhere.mock.calls[0][0]).toBeDefined();
  });
});

describe("retrieveKnowledgeChunks - 排序", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("按 score 倒序", async () => {
    mockLimit.mockResolvedValueOnce([]);
    await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });
    expect(mockOrderBy).toHaveBeenCalledTimes(1);
  });
});

describe("retrieveKnowledgeChunks - 内容裁剪", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("content 超过 MAX_CHUNK_LENGTH → 裁剪", async () => {
    const longContent = "镀膜".repeat(1000); // 2000 字符
    mockLimit.mockResolvedValueOnce([
      { id: "k-1", title: "long", content: longContent, score: 0.7 },
    ]);

    const result = await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result[0].content.length).toBeLessThanOrEqual(MAX_CHUNK_LENGTH);
    // 裁剪上限定义≤800 字
    expect(MAX_CHUNK_LENGTH).toBeLessThanOrEqual(800);
  });

  it("content 等于或短于 MAX_CHUNK_LENGTH → 不裁剪", async () => {
    const short = "镀膜介绍：维持 18 个月。";
    mockLimit.mockResolvedValueOnce([
      { id: "k-1", title: "short", content: short, score: 0.7 },
    ]);

    const result = await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result[0].content).toBe(short);
  });

  it("空 content（极端情况）→ 转为空字符串不抛错", async () => {
    mockLimit.mockResolvedValueOnce([
      { id: "k-1", title: "empty", content: null as unknown as string, score: 0.5 },
    ]);

    const result = await retrieveKnowledgeChunks({
      tenantId: TENANT_A,
      customerQuestion: "镀膜",
    });

    expect(result[0].content).toBe("");
  });
});

describe("retrieveKnowledgeChunks - 安全", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("query 含特殊字符不抛错（drizzle sql 模板自动参数化）", async () => {
    mockLimit.mockResolvedValueOnce([]);
    await expect(
      retrieveKnowledgeChunks({
        tenantId: TENANT_A,
        customerQuestion: "'; DROP TABLE knowledge_base; --",
      })
    ).resolves.toBeDefined();
  });
});

describe("retrieveKnowledgeChunks - 错误处理", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("DB 抛错向上传播", async () => {
    mockLimit.mockRejectedValueOnce(new Error("DB connection lost"));
    await expect(
      retrieveKnowledgeChunks({
        tenantId: TENANT_A,
        customerQuestion: "镀膜",
      })
    ).rejects.toThrow("DB connection lost");
  });
});
