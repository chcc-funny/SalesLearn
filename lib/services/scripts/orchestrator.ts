import { searchScriptCandidates } from "./fulltext-search";
import { rerankScripts } from "./rerank";
import { generateScriptFromKnowledge } from "./generate";

/**
 * Scripts 综合编排（lib/services/scripts/orchestrator.ts）
 *
 * 流程：
 *   1. 空 query 短路 → source='empty'
 *   2. 调 searchScriptCandidates(unit37) 取 trgm 候选（默认 limit=20）
 *   3. 候选 ≥ 3 → 调 rerankScripts(unit38) 重排，返回 top-3，source='curated'
 *      候选 < 3 → 调 generateScriptFromKnowledge(unit40) 兜底生成
 *      生成成功 → items = 原候选 + 新 draft，source='mixed' 或 'generated'
 *      生成失败 → 仅返回原候选，source 退化为 'curated' / 'empty'，附 generateError
 *
 * 设计原则：
 *  - 多租户隔离透传给所有下游
 *  - 三种数据来源（curated/mixed/generated/empty）通过 source 字段告知调用方
 *  - 兜底失败不抛错（路由层 unit42 仍可返回 200 + 友好提示）
 *  - 编排不做 rate limit / 鉴权 / DB 写入（API 层 + service 层各自负责）
 *  - 不做 request_id 幂等（unit42 路由层管理）
 *
 * 不做：
 *  - DB 写入（unit43 submit 路由）
 *  - 候选去重（候选已由 SQL where 唯一）
 *  - 阈值动态调整（v1 固定 ≥ 3 走 curated）
 */

const TOP_K = 3;
const CANDIDATE_THRESHOLD = 3;
const SEARCH_LIMIT = 20;

export type OrchestratorSource =
  | "curated"
  | "generated"
  | "mixed"
  | "empty";

export interface OrchestratorInput {
  tenantId: string;
  customerQuestion: string;
  sceneTagId?: string;
  productTagId?: string;
}

export interface OrchestratorItem {
  /** 候选 id（curated）或 generated 占位 id（'generated:<index>'） */
  id: string;
  title: string;
  customerQuestion: string;
  answer: string;
  /** 排序分（curated/rerank 后；generated 默认 0） */
  score: number;
  /** rerank 给出的理由（仅 curated） */
  rerankReason?: string;
  /** true = LLM 兜底生成的草稿（不在 DB） */
  isGenerated?: boolean;
  /** 兜底生成时引用的 knowledge id 列表 */
  sourceIds?: string[];
}

export interface OrchestratorResult {
  source: OrchestratorSource;
  items: OrchestratorItem[];
  /** rerank 是否降级（仅 curated 路径） */
  degraded?: boolean;
  /** 生成失败时的错误描述（仅 mixed/empty 退化场景） */
  generateError?: string;
}

/**
 * 综合检索：精选命中 → 重排 → top-3，未命中 → 兜底生成。
 */
export async function searchOrGenerateScripts(
  input: OrchestratorInput
): Promise<OrchestratorResult> {
  const customerQuestion = (input.customerQuestion ?? "").trim();
  if (customerQuestion.length === 0) {
    return { source: "empty", items: [] };
  }

  // 1. 取候选
  const candidates = await searchScriptCandidates({
    tenantId: input.tenantId,
    query: customerQuestion,
    sceneTagId: input.sceneTagId,
    productTagId: input.productTagId,
    limit: SEARCH_LIMIT,
  });

  // 2. 候选 ≥ 阈值 → 重排 → top-3
  if (candidates.length >= CANDIDATE_THRESHOLD) {
    const reranked = await rerankScripts({
      candidates,
      customerQuestion,
      // scene/product 标签的「人类可读名」需上层传入；v1 仅用 id 做检索过滤
      // rerank prompt 里的 scene/product 字段非必填，缺失也不影响打分
    });

    return {
      source: "curated",
      items: reranked.items.slice(0, TOP_K).map((i) => ({
        id: i.id,
        title: i.title,
        customerQuestion: i.customerQuestion,
        answer: i.answer,
        score: i.score,
        rerankReason: i.rerankReason,
      })),
      degraded: reranked.degraded,
    };
  }

  // 3. 候选 < 阈值 → 走兜底生成
  let generated: Awaited<ReturnType<typeof generateScriptFromKnowledge>> | null = null;
  let generateError: string | undefined;

  try {
    generated = await generateScriptFromKnowledge({
      tenantId: input.tenantId,
      customerQuestion,
      sceneTagId: input.sceneTagId,
      productTagId: input.productTagId,
    });
  } catch (err) {
    generateError = err instanceof Error ? err.message : String(err);
  }

  // 候选 + 生成都没有 → empty
  if (candidates.length === 0 && !generated) {
    return {
      source: "empty",
      items: [],
      generateError,
    };
  }

  // 仅候选（生成失败）→ curated
  if (!generated) {
    return {
      source: "curated",
      items: candidates.map((c) => ({
        id: c.id,
        title: c.title,
        customerQuestion: c.customerQuestion,
        answer: c.answer,
        score: c.score,
      })),
      generateError,
    };
  }

  // 仅生成（候选为 0）→ generated
  if (candidates.length === 0) {
    return {
      source: "generated",
      items: [
        {
          id: "generated:0",
          title: generated.title,
          customerQuestion: generated.customerQuestion,
          answer: generated.answer,
          score: 0,
          isGenerated: true,
          sourceIds: generated.sourceIds,
        },
      ],
    };
  }

  // 候选 + 生成都有 → mixed
  return {
    source: "mixed",
    items: [
      ...candidates.map((c) => ({
        id: c.id,
        title: c.title,
        customerQuestion: c.customerQuestion,
        answer: c.answer,
        score: c.score,
      })),
      {
        id: "generated:0",
        title: generated.title,
        customerQuestion: generated.customerQuestion,
        answer: generated.answer,
        score: 0,
        isGenerated: true,
        sourceIds: generated.sourceIds,
      },
    ],
  };
}
