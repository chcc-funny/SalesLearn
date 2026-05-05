import { chatCompletionJSON, LLM_MODELS } from "@/lib/llm/openrouter";
import {
  buildScriptGenerationPrompt,
  MAX_USER_INPUT_LENGTH,
} from "./prompt-templates";
import {
  retrieveKnowledgeChunks,
  type KnowledgeChunk,
} from "./knowledge-retrieval";

/**
 * Scripts 兜底生成服务（lib/services/scripts/generate.ts）
 *
 * 流程：
 *   1. 提供 knowledgeChunkIds → 跳过检索（v1 直接信任入参，由调用方保证已校验）
 *      未提供 → retrieveKnowledgeChunks(unit39) 取 Top N 切片
 *   2. buildScriptGenerationPrompt(unit36) 构造 prompt
 *   3. chatCompletionJSON(Claude Sonnet) 调 LLM
 *   4. 解析 → 输出 draft script 字段（title/customerQuestion/answer + 候选标签）
 *
 * 错误处理：
 *  - LLM 调用失败 → GenerateError(code='LLM_ERROR')
 *  - LLM 返回非预期结构 → GenerateError(code='INVALID_RESPONSE')
 *  - LLM 返回空答案 → GenerateError(code='EMPTY_ANSWER')
 *
 * 不做：
 *  - DB 写入（调用方 unit43 submit 路由负责）
 *  - rate limit / 鉴权（API 层）
 *  - 候选话术重排（unit38 / unit41）
 *  - request_id 幂等（unit41 orchestrator）
 *
 * 设计原则：
 *  - LLM 失败抛业务错误（不静默降级），让 unit41 orchestrator 决定降级策略
 *  - 多租户隔离透传给 retrieveKnowledgeChunks
 *  - 单一来源：title 由 customerQuestion 截断生成（与 unit23 风格一致：≤ 200 字）
 */

const TITLE_MAX_LENGTH = 200;

/** 业务错误码 */
export type GenerateErrorCode =
  | "LLM_ERROR"
  | "INVALID_RESPONSE"
  | "EMPTY_ANSWER";

/**
 * 生成失败的业务错误。
 * 路由层用 `instanceof GenerateError` 分支判定 → 400 / 500。
 */
export class GenerateError extends Error {
  public readonly code: GenerateErrorCode;

  constructor(code: GenerateErrorCode, message: string) {
    super(message);
    this.name = "GenerateError";
    this.code = code;
    // 维持 V8 原型链：跨编译目标 instanceof 正常
    Object.setPrototypeOf(this, GenerateError.prototype);
  }
}

export interface GenerateScriptInput {
  tenantId: string;
  customerQuestion: string;
  /** 场景标签 id（候选；透传给检索 + 候选输出） */
  sceneTagId?: string;
  /** 产品标签 id（候选；透传给检索 + 候选输出） */
  productTagId?: string;
  /**
   * 直接指定知识切片 id 列表（跳过检索）。
   * v1 仅取 id 透传给 prompt，不做内容校验（调用方保证 id 合法）。
   * 实际生成中如果有 id 但缺少 content（v1 不查 DB 取 content），sourceIds 仍由 LLM 决定。
   */
  knowledgeChunkIds?: string[];
}

export interface GeneratedScriptDraft {
  /** 标题（由 customerQuestion 截断生成，≤ 200 字） */
  title: string;
  customerQuestion: string;
  /** 销售话术正文 */
  answer: string;
  /** LLM 引用到的知识切片 id 列表 */
  sourceIds: string[];
  /** 候选场景标签 id（透传入参，方便上层填表单） */
  candidateSceneTagIds: string[];
  /** 候选产品标签 id（透传入参，方便上层填表单） */
  candidateProductTagIds: string[];
}

interface GenerationResponseData {
  answer: unknown;
  sourceIds: unknown;
}

/** 标题：客户问题截断到 200 字。 */
function deriveTitleFromQuestion(customerQuestion: string): string {
  const trimmed = customerQuestion.trim();
  if (trimmed.length <= TITLE_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, TITLE_MAX_LENGTH);
}

/** 把 knowledgeChunkIds（无 content）转为 prompt 用的占位 chunk。 */
function chunksFromIds(ids: string[]): KnowledgeChunk[] {
  return ids.map((id) => ({
    id,
    title: "",
    content: "",
    score: 0,
  }));
}

/**
 * 兜底生成话术。
 * @throws {GenerateError} LLM 调用失败 / 返回不合规
 */
export async function generateScriptFromKnowledge(
  input: GenerateScriptInput
): Promise<GeneratedScriptDraft> {
  const customerQuestion = (input.customerQuestion ?? "").trim();

  // 1. 取上下文切片
  let chunks: KnowledgeChunk[];
  if (input.knowledgeChunkIds && input.knowledgeChunkIds.length > 0) {
    chunks = chunksFromIds(input.knowledgeChunkIds);
  } else {
    chunks = await retrieveKnowledgeChunks({
      tenantId: input.tenantId,
      customerQuestion,
      sceneTagId: input.sceneTagId,
      productTagId: input.productTagId,
    });
  }

  // 2. 构造 prompt（buildScriptGenerationPrompt 已做截断 + 注入防御）
  const prompt = buildScriptGenerationPrompt({
    knowledgeChunks: chunks.map((c) => ({ id: c.id, content: c.content })),
    customerQuestion: customerQuestion.slice(0, MAX_USER_INPUT_LENGTH),
    sceneTags: input.sceneTagId ? [input.sceneTagId] : [],
    productTags: input.productTagId ? [input.productTagId] : [],
  });

  // 3. 调 LLM（Claude Sonnet：质量优先）
  let llmData: GenerationResponseData | null;
  try {
    const { data } = await chatCompletionJSON<GenerationResponseData>({
      model: LLM_MODELS.CLAUDE_SONNET,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      maxTokens: 1024,
    });
    llmData = data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GenerateError("LLM_ERROR", `LLM 调用失败：${message}`);
  }

  // 4. 解析 + 校验
  if (!llmData || typeof llmData !== "object") {
    throw new GenerateError("INVALID_RESPONSE", "LLM 返回结构非对象");
  }

  if (typeof llmData.answer !== "string") {
    throw new GenerateError("INVALID_RESPONSE", "LLM 返回的 answer 非字符串");
  }

  const answer = llmData.answer.trim();
  if (answer.length === 0) {
    throw new GenerateError("EMPTY_ANSWER", "LLM 返回的 answer 为空");
  }

  const sourceIds = Array.isArray(llmData.sourceIds)
    ? (llmData.sourceIds.filter((s): s is string => typeof s === "string"))
    : [];

  return {
    title: deriveTitleFromQuestion(customerQuestion),
    customerQuestion,
    answer,
    sourceIds,
    candidateSceneTagIds: input.sceneTagId ? [input.sceneTagId] : [],
    candidateProductTagIds: input.productTagId ? [input.productTagId] : [],
  };
}
