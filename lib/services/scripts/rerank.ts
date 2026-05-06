import { chatCompletionJSON, LLM_MODELS } from "@/lib/llm/openrouter";
import { buildScriptRerankPrompt } from "./prompt-templates";
import type { ScriptCandidate } from "./fulltext-search";

/**
 * Scripts Kimi 重排服务（lib/services/scripts/rerank.ts）
 *
 * 职责：
 *  - 接收 unit37 trgm 候选 + 客户问题 → 调 Kimi（OpenRouter）做语义重排
 *  - 失败兜底：LLM 抛错 / 返回格式异常 → 回退到原顺序，degraded=true
 *
 * 设计原则：
 *  - 复用现有 lib/llm/openrouter.ts（chatCompletionJSON）—— 不引新依赖、不重复造轮子
 *  - Kimi 用 LLM_MODELS.KIMI_K2（项目已设 OpenRouter 路由）
 *  - temperature=0.2：评分任务需要确定性输出
 *  - 边界短路：候选 0 / 1 条不调 LLM
 *  - 评分缺失：LLM 没给分的候选保留原顺序追加（不丢）
 *  - 评分越界：clamp 到 [0,1]
 *
 * 不做：
 *  - DB 读写（候选已由 unit37 提供）
 *  - rate limit / 鉴权（API 层 unit42）
 *  - 知识切片重排（unit39）
 */

export interface RerankInput {
  candidates: ScriptCandidate[];
  customerQuestion: string;
  scene?: string;
  product?: string;
}

export interface RerankedItem extends ScriptCandidate {
  /** 重排后的分数（来自 LLM；降级时退回原 score） */
  score: number;
  /** LLM 评分时给出的理由（仅成功路径） */
  rerankReason?: string;
}

export interface RerankResult {
  items: RerankedItem[];
  /** true = LLM 失败/格式异常，已回退到原顺序 */
  degraded: boolean;
  /** degraded 时的错误描述 */
  error?: string;
}

interface RerankScoreItem {
  id: string;
  score: number;
  reason?: string;
}

interface RerankResponseData {
  scores: RerankScoreItem[];
}

/** clamp 数值到 [0,1] */
function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * 重排候选话术。
 *  - 成功：按 LLM 评分降序；缺评分的候选追加在末尾（保持原顺序）
 *  - 失败：原顺序返回，degraded=true
 */
export async function rerankScripts(input: RerankInput): Promise<RerankResult> {
  const { candidates, customerQuestion, scene, product } = input;

  // 边界短路
  if (candidates.length === 0) {
    return { items: [], degraded: false };
  }
  if (candidates.length === 1) {
    return { items: candidates, degraded: false };
  }

  const prompt = buildScriptRerankPrompt({
    candidates: candidates.map((c) => ({
      id: c.id,
      title: c.title,
      customerQuestion: c.customerQuestion,
      answer: c.answer,
    })),
    customerQuestion,
    scene,
    product,
  });

  try {
    const { data } = await chatCompletionJSON<RerankResponseData>({
      model: LLM_MODELS.KIMI_K2,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      maxTokens: 1024,
    });

    if (!data || !Array.isArray(data.scores)) {
      // LLM 返回不是预期结构 → 降级
      return {
        items: [...candidates],
        degraded: true,
        error: "LLM 返回的 scores 非数组",
      };
    }

    // 用 id → score map 做一次快速查询
    const scoreMap = new Map<string, RerankScoreItem>();
    for (const s of data.scores) {
      if (s && typeof s.id === "string") {
        scoreMap.set(s.id, s);
      }
    }

    // 把候选按是否被评分一分为二
    const scored: RerankedItem[] = [];
    const unscored: RerankedItem[] = [];

    for (const c of candidates) {
      const llmEntry = scoreMap.get(c.id);
      if (llmEntry && typeof llmEntry.score === "number") {
        scored.push({
          ...c,
          score: clamp01(llmEntry.score),
          rerankReason: llmEntry.reason,
        });
      } else {
        unscored.push({ ...c });
      }
    }

    // scored 按新分数降序；unscored 保持原顺序追加
    scored.sort((a, b) => b.score - a.score);

    return {
      items: [...scored, ...unscored],
      degraded: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      items: [...candidates],
      degraded: true,
      error: message,
    };
  }
}
