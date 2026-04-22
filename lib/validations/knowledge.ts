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
});

export type UpdateKnowledgeInput = z.infer<typeof updateKnowledgeSchema>;
