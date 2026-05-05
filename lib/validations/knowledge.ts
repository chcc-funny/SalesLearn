import { z } from "zod";

export const createKnowledgeSchema = z.object({
  title: z
    .string()
    .min(1, "标题不能为空")
    .max(200, "标题不能超过200个字符"),
  category: z.enum(["product", "objection", "closing", "psychology"], {
    message: "分类必须是 product/objection/closing/psychology 之一",
  }),
  keyPoints: z.array(z.string()).default([]),
  content: z.string().min(1, "内容不能为空"),
  examples: z.string().optional(),
  commonMistakes: z.string().optional(),
  images: z.array(z.string()).default([]),
});

export type CreateKnowledgeInput = z.infer<typeof createKnowledgeSchema>;

export const updateKnowledgeSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(200, "标题不能超过200个字符").optional(),
  category: z
    .enum(["product", "objection", "closing", "psychology"], {
      message: "分类必须是 product/objection/closing/psychology 之一",
    })
    .optional(),
  keyPoints: z.array(z.string()).optional(),
  content: z.string().min(1, "内容不能为空").optional(),
  examples: z.string().nullable().optional(),
  commonMistakes: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
  status: z.enum(["draft", "reviewing", "published"]).optional(),
});

export type UpdateKnowledgeInput = z.infer<typeof updateKnowledgeSchema>;

const batchIdsSchema = z
  .array(z.string().uuid("ID 必须是合法的 UUID"))
  .min(1, "至少选择一个知识点")
  .max(100, "一次最多操作 100 个知识点");

export const batchKnowledgeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("publish"),
    ids: batchIdsSchema,
  }),
  z.object({
    action: z.literal("delete"),
    ids: batchIdsSchema,
  }),
  z.object({
    action: z.literal("setCategory"),
    ids: batchIdsSchema,
    category: z.enum(["product", "objection", "closing", "psychology"], {
      message: "分类必须是 product/objection/closing/psychology 之一",
    }),
  }),
]);

export type BatchKnowledgeInput = z.infer<typeof batchKnowledgeSchema>;
