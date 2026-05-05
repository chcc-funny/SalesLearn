import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  scriptTags,
  type ScriptTag,
  type ScriptTagGroupKey,
} from "@/lib/db/schema/script-tags";

/**
 * 话术标签服务（lib/services/scripts/tags.ts）
 *
 * 职责：
 *  - 列表查询（按租户 + 可选 groupKey + onlyActive 过滤）
 *  - 创建 / 更新 / 软删（保留历史关联）/ 排序
 *  - 不直接处理多租户鉴权（API 层负责），但所有 SQL 显式带 tenantId 防越权
 *
 * 设计原则：
 *  - service 层不抛业务校验错（zod 在 API 层完成）
 *  - 找不到记录的非异常情况返回 null（更新/软删）
 *  - 写操作返回 returning() 单行，便于上层直接响应
 */

export interface ListTagsOptions {
  groupKey?: ScriptTagGroupKey;
  /** 默认 true：仅返回启用中的标签 */
  onlyActive?: boolean;
}

/**
 * 查询某租户下的标签列表，按 (groupKey, sortOrder, name) 排序。
 */
export async function listTags(
  tenantId: string,
  options: ListTagsOptions = {}
): Promise<ScriptTag[]> {
  const { groupKey, onlyActive = true } = options;

  const conditions = [eq(scriptTags.tenantId, tenantId)];
  if (groupKey) {
    conditions.push(eq(scriptTags.groupKey, groupKey));
  }
  if (onlyActive) {
    conditions.push(eq(scriptTags.isActive, true));
  }

  const rows = await db
    .select()
    .from(scriptTags)
    .where(and(...conditions))
    .orderBy(asc(scriptTags.groupKey), asc(scriptTags.sortOrder), asc(scriptTags.name));

  return rows;
}

export interface CreateTagInput {
  groupKey: ScriptTagGroupKey;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

/**
 * 新建标签。返回插入后的完整行；若 returning 为空则视为异常。
 *
 * 注意：UNIQUE(tenant_id, group_key, name) 由 DB 兜底；上层捕获重复时返回 409。
 */
export async function createTag(
  tenantId: string,
  input: CreateTagInput
): Promise<ScriptTag> {
  const [created] = await db
    .insert(scriptTags)
    .values({
      tenantId,
      groupKey: input.groupKey,
      name: input.name,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    })
    .returning();

  if (!created) {
    throw new Error("创建标签失败：数据库未返回插入行");
  }
  return created;
}

export interface UpdateTagInput {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * 更新标签，租户隔离。找不到记录返回 null。
 *
 * 不允许跨 group 改组（API 层 schema 已不暴露 groupKey）。
 */
export async function updateTag(
  tenantId: string,
  id: string,
  input: UpdateTagInput
): Promise<ScriptTag | null> {
  const patch: Record<string, unknown> = { ...input, updatedAt: new Date() };

  const [updated] = await db
    .update(scriptTags)
    .set(patch)
    .where(and(eq(scriptTags.tenantId, tenantId), eq(scriptTags.id, id)))
    .returning();

  return updated ?? null;
}

/**
 * 软删标签：is_active=false，保留历史 script_tag_relations。
 * 返回受影响行；找不到返回 null。
 */
export async function softDeleteTag(
  tenantId: string,
  id: string
): Promise<ScriptTag | null> {
  const [updated] = await db
    .update(scriptTags)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(scriptTags.tenantId, tenantId), eq(scriptTags.id, id)))
    .returning();

  return updated ?? null;
}

/**
 * 拖拽排序：按 orderedIds 顺序更新每个标签的 sortOrder = index。
 *
 * 实现说明：
 *  - 单条更新串行下发（v1 数据量小，标签 < 50）
 *  - 同时校验 groupKey 隔离（不能把 scene 标签拖到 product 列）
 *  - 空数组直接 noop
 */
export async function sortTags(
  tenantId: string,
  groupKey: ScriptTagGroupKey,
  orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return;

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    await db
      .update(scriptTags)
      .set({ sortOrder: i, updatedAt: new Date() })
      .where(
        and(
          eq(scriptTags.tenantId, tenantId),
          eq(scriptTags.groupKey, groupKey),
          eq(scriptTags.id, id)
        )
      )
      .returning();
  }
}
