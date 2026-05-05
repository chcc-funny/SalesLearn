import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { scripts } from "@/lib/db/schema/scripts";
import { scriptTagRelations } from "@/lib/db/schema/script-tag-relations";

/**
 * Scripts 全文检索（lib/services/scripts/fulltext-search.ts）
 *
 * 用 pg_trgm 索引（unit05 已建好 GIN trgm 部分索引）做模糊检索。
 * 返回候选话术 + 相似度分数（trigram similarity），供 unit38 重排器使用。
 *
 * 设计原则：
 *  - 多租户隔离强制（必带 tenantId）
 *  - 默认仅检索 status='published' + deletedAt IS NULL
 *  - 用 drizzle sql\`...\` 模板做安全参数化（不直接拼接 query 字符串）
 *  - 空 query 短路返回空数组（不浪费 DB RTT）
 *  - 使用 GREATEST(similarity(title, q), similarity(question, q)) 取双字段最高分
 *
 * 不做：
 *  - LLM 重排（unit38）
 *  - 知识库切片检索（unit39）
 *  - rate limit / 鉴权（API 层）
 */

export interface SearchScriptCandidatesInput {
  tenantId: string;
  query: string;
  /** 场景标签 id（可选，触发 inner join） */
  sceneTagId?: string;
  /** 产品标签 id（可选，触发 inner join） */
  productTagId?: string;
  /** 返回结果数（默认 20，最小 1） */
  limit?: number;
}

export interface ScriptCandidate {
  id: string;
  title: string;
  customerQuestion: string;
  answer: string;
  /** trigram 相似度分数（0-1） */
  score: number;
}

/**
 * 模糊检索候选话术。
 *
 * SQL 大致：
 *   SELECT id, title, customer_question, answer,
 *          GREATEST(similarity(title, $q), similarity(customer_question, $q)) AS score
 *   FROM scripts
 *   [INNER JOIN script_tag_relations r1 ON r1.script_id = id AND r1.tag_id = $sceneTag]
 *   [INNER JOIN script_tag_relations r2 ON r2.script_id = id AND r2.tag_id = $productTag]
 *   WHERE tenant_id = $tenant
 *     AND status = 'published'
 *     AND deleted_at IS NULL
 *     AND (title % $q OR customer_question % $q)   -- pg_trgm 操作符走 GIN 索引
 *   ORDER BY score DESC
 *   LIMIT $limit
 */
export async function searchScriptCandidates(
  input: SearchScriptCandidatesInput
): Promise<ScriptCandidate[]> {
  const trimmed = (input.query ?? "").trim();
  if (trimmed.length === 0) {
    return [];
  }

  const limit = Math.max(1, input.limit ?? 20);

  // pg_trgm: similarity(text, query) 返回 0-1 分，自动参数化
  const scoreExpr = sql<number>`GREATEST(similarity(${scripts.title}, ${trimmed}), similarity(${scripts.customerQuestion}, ${trimmed}))`;

  const builder = db
    .select({
      id: scripts.id,
      title: scripts.title,
      customerQuestion: scripts.customerQuestion,
      answer: scripts.answer,
      score: scoreExpr.as("score"),
    })
    .from(scripts);

  // 标签过滤：通过多对多 join 强制收敛 script_id
  // drizzle 链式 builder 在 chain 上 inner join；mock 测试中 wireChain 把 innerJoin 也接到 where
  let chain = builder as unknown as {
    innerJoin: typeof builder.innerJoin;
    where: typeof builder.where;
  };

  if (input.sceneTagId) {
    chain = chain.innerJoin(
      scriptTagRelations,
      and(
        eq(scriptTagRelations.scriptId, scripts.id),
        eq(scriptTagRelations.tagId, input.sceneTagId)
      )!
    ) as unknown as typeof chain;
  }

  if (input.productTagId) {
    chain = chain.innerJoin(
      scriptTagRelations,
      and(
        eq(scriptTagRelations.scriptId, scripts.id),
        eq(scriptTagRelations.tagId, input.productTagId)
      )!
    ) as unknown as typeof chain;
  }

  const conditions = [
    eq(scripts.tenantId, input.tenantId),
    eq(scripts.status, "published"),
    isNull(scripts.deletedAt),
    // pg_trgm 模糊匹配：% 操作符（走 GIN trgm 索引）
    sql`(${scripts.title} % ${trimmed} OR ${scripts.customerQuestion} % ${trimmed})`,
  ];

  const rows = await chain
    .where(and(...conditions))
    // ts-ignore: chain 已被显式 cast 为带 where 的 builder
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .orderBy(desc(sql`score`) as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .limit(limit) as any;

  return rows as ScriptCandidate[];
}
