import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeBase } from "@/lib/db/schema/knowledge-base";

/**
 * Scripts 知识切片检索（lib/services/scripts/knowledge-retrieval.ts）
 *
 * 用 pg_trgm 索引在 knowledge_base 表里做模糊检索，作为 unit40 兜底生成的上下文。
 * 风格与 unit37 fulltext-search.ts 一致（参数化 sql\`\` 模板，避免直接拼字符串）。
 *
 * 设计原则：
 *  - 多租户隔离强制（必带 tenantId）
 *  - 默认仅检索 status='published'（与知识库审核闭环一致）
 *  - 空 query 短路返回空数组（不浪费 DB RTT）
 *  - GREATEST(similarity(title, q), similarity(content, q)) 取双字段最高分
 *  - 单条切片 content 裁剪到 MAX_CHUNK_LENGTH 字（≤ 800）防止 prompt 过长
 *  - limit 默认 5；最小 1；最大 50（避免一次查询拖慢）
 *
 * 不做：
 *  - tag 过滤（v1 知识库无标签关系；如需可在 Phase 2 后续补充）
 *  - LLM 重排（生成层 unit40 直接传给 prompt 即可，知识库 5 条已够紧凑）
 *  - rate limit / 鉴权（API 层 unit42）
 *
 * 注意：sceneTagId / productTagId 入参保留以兼容 orchestrator 调用签名，但 v1 不参与
 * SQL 拼装；后续若要做基于知识库的标签过滤，需要新增 knowledge_tag_relations 表。
 */

/** 单条切片内容最大字符数（裁剪后用于 prompt） */
export const MAX_CHUNK_LENGTH = 800;

/** 默认返回数量 */
export const DEFAULT_LIMIT = 5;

/** 最大返回数量（防止过大批查询） */
export const MAX_LIMIT = 50;

export interface RetrieveKnowledgeChunksInput {
  tenantId: string;
  customerQuestion: string;
  /** 场景标签 id（v1 暂不参与 SQL；保留兼容签名） */
  sceneTagId?: string;
  /** 产品标签 id（v1 暂不参与 SQL；保留兼容签名） */
  productTagId?: string;
  /** 返回结果数（默认 DEFAULT_LIMIT，最小 1，最大 MAX_LIMIT） */
  limit?: number;
}

export interface KnowledgeChunk {
  id: string;
  title: string;
  /** 已裁剪到 ≤ MAX_CHUNK_LENGTH */
  content: string;
  /** trigram 相似度分数（0-1） */
  score: number;
}

/** 内容裁剪：null/undefined → ""；超长 → slice */
function trimChunkContent(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (text.length <= MAX_CHUNK_LENGTH) return text;
  return text.slice(0, MAX_CHUNK_LENGTH);
}

/** limit 钳到 [1, MAX_LIMIT] */
function clampLimit(input: number | undefined): number {
  const v = input ?? DEFAULT_LIMIT;
  if (v < 1) return 1;
  if (v > MAX_LIMIT) return MAX_LIMIT;
  return v;
}

/**
 * 模糊检索知识库切片。
 *
 * SQL 大致：
 *   SELECT id, title, content,
 *          GREATEST(similarity(title, $q), similarity(content, $q)) AS score
 *   FROM knowledge_base
 *   WHERE tenant_id = $tenant
 *     AND status = 'published'
 *     AND (title % $q OR content % $q)
 *   ORDER BY score DESC
 *   LIMIT $limit
 */
export async function retrieveKnowledgeChunks(
  input: RetrieveKnowledgeChunksInput
): Promise<KnowledgeChunk[]> {
  const trimmed = (input.customerQuestion ?? "").trim();
  if (trimmed.length === 0) {
    return [];
  }

  const limit = clampLimit(input.limit);

  const scoreExpr = sql<number>`GREATEST(similarity(${knowledgeBase.title}, ${trimmed}), similarity(${knowledgeBase.content}, ${trimmed}))`;

  const conditions = [
    eq(knowledgeBase.tenantId, input.tenantId),
    eq(knowledgeBase.status, "published"),
    sql`(${knowledgeBase.title} % ${trimmed} OR ${knowledgeBase.content} % ${trimmed})`,
  ];

  const rows = (await db
    .select({
      id: knowledgeBase.id,
      title: knowledgeBase.title,
      content: knowledgeBase.content,
      score: scoreExpr.as("score"),
    })
    .from(knowledgeBase)
    .where(and(...conditions))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .orderBy(desc(sql`score`) as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .limit(limit)) as Array<{
    id: string;
    title: string;
    content: string | null;
    score: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: trimChunkContent(r.content),
    score: r.score,
  }));
}
