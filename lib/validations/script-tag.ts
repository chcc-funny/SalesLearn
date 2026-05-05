import { z } from "zod";
import { scriptTagGroupKeys } from "@/lib/db/schema/script-tags";

/**
 * 话术标签（script_tags）相关 zod 校验
 *
 * 与 schema 字段约束对齐（README §3.2）：
 *  - group_key: scene / product
 *  - name: VARCHAR(50)
 *  - sort_order: INT，前端不直传负值
 *  - is_active: 软删标记
 *
 * 单一来源：group_key 枚举从 schema 常量派生。
 */

const tagNameSchema = z
  .string()
  .min(1, "标签名不能为空")
  .max(50, "标签名不能超过50个字符");

const sortOrderSchema = z
  .number()
  .int("排序值必须是整数")
  .min(0, "排序值必须 ≥ 0")
  .max(9999, "排序值过大");

// ----------------------------------------------------------------------------
// 创建
// ----------------------------------------------------------------------------
export const createScriptTagSchema = z.object({
  groupKey: z.enum(scriptTagGroupKeys, {
    message: `group_key 必须是 ${scriptTagGroupKeys.join(" / ")} 之一`,
  }),
  name: tagNameSchema,
  sortOrder: sortOrderSchema.default(0),
  isActive: z.boolean().default(true),
});

export type CreateScriptTagInput = z.infer<typeof createScriptTagSchema>;

// ----------------------------------------------------------------------------
// 更新：name / sortOrder / isActive 任一可选；不可改 groupKey 避免越类
// ----------------------------------------------------------------------------
export const updateScriptTagSchema = z
  .object({
    name: tagNameSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "至少提交一个待更新字段" }
  );

export type UpdateScriptTagInput = z.infer<typeof updateScriptTagSchema>;

// ----------------------------------------------------------------------------
// 列表查询
// ----------------------------------------------------------------------------
// 接受 boolean 直传 / "true" / "false" / "1" / "0"
// 不能用 z.coerce.boolean()：它把所有非空字符串当 true（"false" → true 是常见坑）
const queryBooleanSchema = z.preprocess((val) => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    if (val === "true" || val === "1") return true;
    if (val === "false" || val === "0") return false;
  }
  return val;
}, z.boolean());

export const listScriptTagsQuerySchema = z.object({
  groupKey: z.enum(scriptTagGroupKeys).optional(),
  // 默认仅返回启用中的；管理端可显式传 false 看全量
  onlyActive: queryBooleanSchema.default(true),
});

export type ListScriptTagsQuery = z.infer<typeof listScriptTagsQuerySchema>;

// ----------------------------------------------------------------------------
// 排序：管理端拖拽排序时批量提交
// ----------------------------------------------------------------------------
export const sortScriptTagsSchema = z.object({
  groupKey: z.enum(scriptTagGroupKeys, {
    message: `group_key 必须是 ${scriptTagGroupKeys.join(" / ")} 之一`,
  }),
  orderedIds: z
    .array(z.string().uuid("标签 ID 必须是合法的 UUID"))
    .min(1, "排序列表不能为空")
    .max(100, "排序列表过长"),
});

export type SortScriptTagsInput = z.infer<typeof sortScriptTagsSchema>;
