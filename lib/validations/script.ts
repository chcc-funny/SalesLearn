import { z } from "zod";
import {
  scriptStatuses,
  scriptSources,
} from "@/lib/db/schema/scripts";

/**
 * 话术（scripts）相关 zod 校验
 *
 * 单一来源原则：状态/来源 enum 直接从 schema 常量派生，
 * 任何修改 schema 的人会被 TS 同步提示更新校验。
 *
 * 字段长度上限与 docs/features/scripts/README.md §3.1 对齐：
 *  - title: 200
 *  - customer_question: TEXT，但生成接口 ≤500 字（防 Prompt Injection）
 *  - 标签 ID 用 UUID
 */

// 与 schema 字段对齐的基础约束（可被多处复用）
const titleSchema = z
  .string()
  .min(1, "标题不能为空")
  .max(200, "标题不能超过200个字符");

const customerQuestionSchema = z
  .string()
  .min(1, "客户问题不能为空")
  .max(2000, "客户问题不能超过2000个字符");

const answerSchema = z
  .string()
  .min(1, "答案不能为空")
  .max(10000, "答案不能超过10000个字符");

const tagIdsSchema = z
  .array(z.string().uuid("标签 ID 必须是合法的 UUID"))
  .max(20, "单条话术最多关联 20 个标签");

const questionAliasSchema = z
  .string()
  .min(1, "同义问题不能为空")
  .max(500, "同义问题不能超过500个字符");

const knowledgeIdSchema = z
  .string()
  .uuid("knowledgeId 必须是合法的 UUID")
  .nullable()
  .optional();

// ----------------------------------------------------------------------------
// 创建：管理端新增 / 从知识库标记
// ----------------------------------------------------------------------------
export const createScriptSchema = z.object({
  title: titleSchema,
  customerQuestion: customerQuestionSchema,
  answer: answerSchema,
  questionAliases: z.array(questionAliasSchema).max(10).default([]),
  source: z.enum(scriptSources, {
    message: `source 必须是 ${scriptSources.join(" / ")} 之一`,
  }),
  knowledgeId: knowledgeIdSchema,
  // 创建时仅允许 draft / published，pending_review/rejected/archived 由专用接口流转
  status: z
    .enum(["draft", "published"], {
      message: "创建时 status 必须是 draft / published 之一",
    })
    .default("draft"),
  sceneTagIds: tagIdsSchema.default([]),
  productTagIds: tagIdsSchema.default([]),
});

export type CreateScriptInput = z.infer<typeof createScriptSchema>;

// ----------------------------------------------------------------------------
// 更新：管理端编辑（不直接改 status，状态切换走 review/archive 接口）
// ----------------------------------------------------------------------------
export const updateScriptSchema = z
  .object({
    title: titleSchema.optional(),
    customerQuestion: customerQuestionSchema.optional(),
    answer: answerSchema.optional(),
    questionAliases: z.array(questionAliasSchema).max(10).optional(),
    knowledgeId: knowledgeIdSchema,
    sceneTagIds: tagIdsSchema.optional(),
    productTagIds: tagIdsSchema.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "至少提交一个待更新字段" }
  );

export type UpdateScriptInput = z.infer<typeof updateScriptSchema>;

// ----------------------------------------------------------------------------
// 列表查询：员工/管理端复用，前端用 ?q= 与 ?status= 等
// ----------------------------------------------------------------------------
export const listScriptsQuerySchema = z.object({
  q: z.string().max(200, "搜索关键词不超过200字符").optional(),
  status: z.enum(scriptStatuses).optional(),
  source: z.enum(scriptSources).optional(),
  sceneTagIds: z.array(z.string().uuid()).max(10).default([]),
  productTagIds: z.array(z.string().uuid()).max(10).default([]),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListScriptsQuery = z.infer<typeof listScriptsQuerySchema>;

// ----------------------------------------------------------------------------
// 复制：路径参数 :id 由路由层校验，body 当前为空
// ----------------------------------------------------------------------------
export const copyScriptSchema = z.object({}).strict();

export type CopyScriptInput = z.infer<typeof copyScriptSchema>;

// ----------------------------------------------------------------------------
// 生成：员工粘贴客户问题，前端硬限 500 字（Prompt Injection 防护一层）
// ----------------------------------------------------------------------------
export const GENERATE_QUESTION_MAX_LENGTH = 500;

export const generateScriptSchema = z.object({
  customerQuestion: z
    .string()
    .min(1, "客户问题不能为空")
    .max(
      GENERATE_QUESTION_MAX_LENGTH,
      `客户问题不能超过${GENERATE_QUESTION_MAX_LENGTH}个字符`
    ),
});

export type GenerateScriptInput = z.infer<typeof generateScriptSchema>;

// ----------------------------------------------------------------------------
// 提交审核：携带生成时返回的 request_id 做幂等
// ----------------------------------------------------------------------------
export const submitScriptSchema = z.object({
  requestId: z.string().uuid("requestId 必须是合法的 UUID"),
  title: titleSchema,
  customerQuestion: customerQuestionSchema,
  answer: answerSchema,
  knowledgeId: knowledgeIdSchema,
  sceneTagIds: tagIdsSchema.default([]),
  productTagIds: tagIdsSchema.default([]),
});

export type SubmitScriptInput = z.infer<typeof submitScriptSchema>;

// ----------------------------------------------------------------------------
// 审核：approve 可附带 edits 修订；reject 必须给原因
// ----------------------------------------------------------------------------
const reviewEditsSchema = z
  .object({
    title: titleSchema.optional(),
    customerQuestion: customerQuestionSchema.optional(),
    answer: answerSchema.optional(),
    sceneTagIds: tagIdsSchema.optional(),
    productTagIds: tagIdsSchema.optional(),
  })
  .optional();

export const reviewScriptSchema = z
  .discriminatedUnion("action", [
    z.object({
      action: z.literal("approve"),
      edits: reviewEditsSchema,
    }),
    z.object({
      action: z.literal("reject"),
      rejectReason: z
        .string()
        .min(1, "拒绝原因不能为空")
        .max(500, "拒绝原因不能超过500个字符"),
    }),
  ]);

export type ReviewScriptInput = z.infer<typeof reviewScriptSchema>;
