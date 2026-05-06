/**
 * 精选话术（Scripts）模块 - 初始标签 seed
 *
 * 来源：docs/features/scripts/README.md §3.5
 *   - 场景：价格异议 / 产品对比 / 信任建立 / 促单逼定 / 售后维保 / 客户犹豫 / 投诉处理
 *   - 产品：隔热膜 / 车衣 / 镀晶 / 改色膜 / 内饰清洗
 *
 * 仅暴露纯函数 `seedScriptTags(db, tenantId)`，幂等（onConflictDoNothing）。
 * 不直接连数据库，调用入口由现有 seed 脚本（lib/db/seed.ts）或 admin 工具负责。
 */
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { scriptTags, type NewScriptTag } from "./schema/script-tags";

export const INITIAL_SCENE_TAGS = [
  "价格异议",
  "产品对比",
  "信任建立",
  "促单逼定",
  "售后维保",
  "客户犹豫",
  "投诉处理",
] as const;

export const INITIAL_PRODUCT_TAGS = [
  "隔热膜",
  "车衣",
  "镀晶",
  "改色膜",
  "内饰清洗",
] as const;

/**
 * 构造初始标签的插入数据（按出现顺序写入 sort_order，便于前端默认排序）
 */
export function buildInitialScriptTags(tenantId: string): NewScriptTag[] {
  const sceneRows: NewScriptTag[] = INITIAL_SCENE_TAGS.map((name, index) => ({
    tenantId,
    groupKey: "scene",
    name,
    sortOrder: index,
    isActive: true,
  }));

  const productRows: NewScriptTag[] = INITIAL_PRODUCT_TAGS.map(
    (name, index) => ({
      tenantId,
      groupKey: "product",
      name,
      sortOrder: index,
      isActive: true,
    })
  );

  return [...sceneRows, ...productRows];
}

/**
 * 幂等插入：依赖 (tenant_id, group_key, name) UNIQUE 约束
 * 已存在则跳过；不更新已有行的 sort_order/is_active（避免覆盖管理员后续编辑）
 */
export async function seedScriptTags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: NeonHttpDatabase<any>,
  tenantId: string
): Promise<{ attempted: number }> {
  const rows = buildInitialScriptTags(tenantId);
  await db.insert(scriptTags).values(rows).onConflictDoNothing({
    target: [scriptTags.tenantId, scriptTags.groupKey, scriptTags.name],
  });
  return { attempted: rows.length };
}
