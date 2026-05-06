import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  scripts,
  type Script,
  type ScriptStatus,
  type ScriptSource,
} from "@/lib/db/schema/scripts";
import { scriptTagRelations } from "@/lib/db/schema/script-tag-relations";
import { assertTransition } from "./state-machine";

/**
 * 话术仓储/服务（lib/services/scripts/repository.ts）
 *
 * 职责：
 *  - 列表 / 详情 / 创建 / 更新 / 状态切换 / 软删 / 归档
 *  - 多对多标签关联同步（事务内 delete + insert）
 *  - 状态变更必须经过 state-machine.assertTransition
 *
 * 不做：
 *  - AI 检索 / 重排 / 兜底生成（Phase 2 在 fulltext-search / rerank / generate / orchestrator 中）
 *  - 接口鉴权（API 层 withAuth + zod）
 *  - rate limit（API 层）
 *
 * 设计原则：
 *  - 所有读写显式 `WHERE tenant_id = ?` 防越权
 *  - 「未找到」走 null，不抛错；状态机非法 / 数据库返回空才抛错
 *  - 对 tx 的依赖通过 db.transaction() 隔离写入语义
 */

// ----------------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------------
export interface ListScriptsFilters {
  q?: string;
  status?: ScriptStatus;
  source?: ScriptSource;
  sceneTagIds?: string[];
  productTagIds?: string[];
  /**
   * 员工端可读范围扩展：当传入时，列表条件改为
   *   `status = <filters.status> OR created_by = <mineUserId>`
   * 用于员工除读 published 之外，可见自己创建的草稿/待审核话术。
   * 仅与 `status` 同时生效；不传则按 status 单条件过滤（默认管理端语义）。
   */
  mineUserId?: string;
}

export interface ListScriptsPagination {
  page: number;
  pageSize: number;
}

export interface ListScriptsResult {
  items: Script[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ScriptWithTags extends Script {
  /** 关联的所有标签 ID（场景 + 产品合并） */
  tagIds: string[];
}

export interface CreateScriptInput {
  title: string;
  customerQuestion: string;
  answer: string;
  questionAliases: string[];
  source: ScriptSource;
  knowledgeId: string | null | undefined;
  status: "draft" | "published";
  sceneTagIds: string[];
  productTagIds: string[];
}

export interface UpdateScriptInput {
  title?: string;
  customerQuestion?: string;
  answer?: string;
  questionAliases?: string[];
  knowledgeId?: string | null;
  sceneTagIds?: string[];
  productTagIds?: string[];
}

// ----------------------------------------------------------------------------
// 列表
// ----------------------------------------------------------------------------
/**
 * 列表查询：仅返回未软删的话术。租户隔离强制。
 *
 * 过滤优先级：
 *  - tenantId（必填）
 *  - deletedAt IS NULL（强制）
 *  - status / source（精确）
 *  - q（trgm 模糊匹配 title 或 customerQuestion）
 *  - sceneTagIds / productTagIds（暂未在此处 join，留给 Phase 2 与 listScripts(byTags) 二次查询）
 */
export async function listScripts(
  tenantId: string,
  filters: ListScriptsFilters,
  pagination: ListScriptsPagination
): Promise<ListScriptsResult> {
  const { page, pageSize } = pagination;
  const conditions = [
    eq(scripts.tenantId, tenantId),
    isNull(scripts.deletedAt),
  ];

  if (filters.status) {
    if (filters.mineUserId) {
      // 员工端：可读 (status=? OR created_by=自己)，仍然处于 tenant_id + 未软删 范围内
      conditions.push(
        or(
          eq(scripts.status, filters.status),
          eq(scripts.createdBy, filters.mineUserId)
        )!
      );
    } else {
      conditions.push(eq(scripts.status, filters.status));
    }
  } else if (filters.mineUserId) {
    // 仅传 mineUserId 时退化为「自己创建的」，保留扩展性
    conditions.push(eq(scripts.createdBy, filters.mineUserId));
  }
  if (filters.source) {
    conditions.push(eq(scripts.source, filters.source));
  }
  if (filters.q && filters.q.trim().length > 0) {
    const q = filters.q.trim();
    // pg_trgm 双字段 OR；ILIKE 兜底（v1 用 ILIKE 即可，trgm 索引会被规划器选择）
    const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    conditions.push(
      or(
        sql`${scripts.title} ILIKE ${`%${escaped}%`}`,
        sql`${scripts.customerQuestion} ILIKE ${`%${escaped}%`}`
      )!
    );
  }

  const where = and(...conditions);
  const offset = (page - 1) * pageSize;

  const [items, countRows] = await Promise.all([
    db
      .select()
      .from(scripts)
      .where(where)
      .orderBy(desc(scripts.updatedAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(scripts)
      .where(where),
  ]);

  const total = countRows[0]?.count ?? 0;

  return { items, total, page, pageSize };
}

// ----------------------------------------------------------------------------
// 详情
// ----------------------------------------------------------------------------
/**
 * 按 id + tenantId 查询单条话术，附带标签 IDs。
 * 跨租户 / 软删 → 返回 null。
 */
export async function getScriptById(
  id: string,
  tenantId: string
): Promise<ScriptWithTags | null> {
  const rows = await db
    .select()
    .from(scripts)
    .where(
      and(
        eq(scripts.id, id),
        eq(scripts.tenantId, tenantId),
        isNull(scripts.deletedAt)
      )
    );

  const row = rows[0];
  if (!row) return null;

  // 防御性多对多：除了 scriptId 过滤，再 inner join scripts 强制 tenantId 一致
  // 即使外层调用顺序变化或被单独复用，也不会越权读到他租户的标签关系
  const tagRows = await db
    .select({ tagId: scriptTagRelations.tagId })
    .from(scriptTagRelations)
    .innerJoin(scripts, eq(scripts.id, scriptTagRelations.scriptId))
    .where(
      and(
        eq(scriptTagRelations.scriptId, id),
        eq(scripts.tenantId, tenantId)
      )
    );

  return { ...row, tagIds: tagRows.map((r) => r.tagId) };
}

// ----------------------------------------------------------------------------
// 创建
// ----------------------------------------------------------------------------
/**
 * 事务内：插入 scripts + 标签关系。
 *
 * 注意：
 *  - 标签关系不做存在性校验（API 层应预先确认）；DB 的 FK 与多对多 PK 兜底
 *  - status 仅允许 draft/published（zod 已限制），不需要状态机校验（首次入库）
 */
export async function createScript(
  tenantId: string,
  createdBy: string,
  input: CreateScriptInput
): Promise<ScriptWithTags> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(scripts)
      .values({
        tenantId,
        title: input.title,
        customerQuestion: input.customerQuestion,
        questionAliases: input.questionAliases,
        answer: input.answer,
        source: input.source,
        knowledgeId: input.knowledgeId ?? null,
        status: input.status,
        createdBy,
      })
      .returning();

    if (!created) {
      throw new Error("创建话术失败：数据库未返回插入行");
    }

    const tagIds = [...input.sceneTagIds, ...input.productTagIds];
    if (tagIds.length > 0) {
      await tx
        .insert(scriptTagRelations)
        .values(tagIds.map((tagId) => ({ scriptId: created.id, tagId })))
        .onConflictDoNothing();
    }

    return { ...created, tagIds };
  });
}

// ----------------------------------------------------------------------------
// 更新
// ----------------------------------------------------------------------------
/**
 * 更新话术主表 + 同步标签关系（如提供 sceneTagIds / productTagIds）。
 * 不更新 status；状态切换走 patchScriptStatus / archiveScript / review API。
 */
export async function updateScript(
  tenantId: string,
  id: string,
  input: UpdateScriptInput
): Promise<ScriptWithTags | null> {
  return db.transaction(async (tx) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.customerQuestion !== undefined)
      patch.customerQuestion = input.customerQuestion;
    if (input.answer !== undefined) patch.answer = input.answer;
    if (input.questionAliases !== undefined)
      patch.questionAliases = input.questionAliases;
    if (input.knowledgeId !== undefined) patch.knowledgeId = input.knowledgeId;

    const [updated] = await tx
      .update(scripts)
      .set(patch)
      .where(
        and(
          eq(scripts.id, id),
          eq(scripts.tenantId, tenantId),
          isNull(scripts.deletedAt)
        )
      )
      .returning();

    if (!updated) return null;

    // 提供任一标签集合即视为「重写关联标签」
    const willRewriteTags =
      input.sceneTagIds !== undefined || input.productTagIds !== undefined;

    if (willRewriteTags) {
      await tx
        .delete(scriptTagRelations)
        .where(eq(scriptTagRelations.scriptId, id));

      const newTagIds = [
        ...(input.sceneTagIds ?? []),
        ...(input.productTagIds ?? []),
      ];
      if (newTagIds.length > 0) {
        await tx
          .insert(scriptTagRelations)
          .values(newTagIds.map((tagId) => ({ scriptId: id, tagId })))
          .onConflictDoNothing();
      }
    }

    // 重新聚合 tagIds 返回
    const tagRows = await tx
      .select({ tagId: scriptTagRelations.tagId })
      .from(scriptTagRelations)
      .where(eq(scriptTagRelations.scriptId, id));

    return { ...updated, tagIds: tagRows.map((r) => r.tagId) };
  });
}

// ----------------------------------------------------------------------------
// 状态切换
// ----------------------------------------------------------------------------
/**
 * 通用状态切换：先读当前 status，经状态机校验后写入。
 * 找不到记录 → 返回 null（不抛错）。
 * 非法跳转 → 抛 ScriptStateTransitionError。
 *
 * 一致性：读+校验+写包在 `db.transaction()` 中，避免 TOCTOU 竞态
 * （并发请求读到相同 from status 后各自通过状态机校验，造成状态机绕过）。
 */
export async function patchScriptStatus(
  tenantId: string,
  id: string,
  to: ScriptStatus
): Promise<Script | null> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(scripts)
      .where(
        and(
          eq(scripts.id, id),
          eq(scripts.tenantId, tenantId),
          isNull(scripts.deletedAt)
        )
      );

    const current = rows[0];
    if (!current) return null;

    const from = current.status as ScriptStatus;
    assertTransition(from, to);

    const [updated] = await tx
      .update(scripts)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(scripts.id, id), eq(scripts.tenantId, tenantId)))
      .returning();

    return updated ?? null;
  });
}

// ----------------------------------------------------------------------------
// 软删
// ----------------------------------------------------------------------------
/**
 * 软删：置 deleted_at = NOW()。状态保留不变。
 */
export async function softDeleteScript(
  tenantId: string,
  id: string
): Promise<Script | null> {
  const [updated] = await db
    .update(scripts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(scripts.id, id),
        eq(scripts.tenantId, tenantId),
        isNull(scripts.deletedAt)
      )
    )
    .returning();

  return updated ?? null;
}

// ----------------------------------------------------------------------------
// 归档（published → archived）
// ----------------------------------------------------------------------------
/**
 * 主管下架：等价于 patchScriptStatus(..., 'archived')，但 from 必须是 published。
 * 状态机会拒绝其他来源（如 draft → archived）。
 */
export async function archiveScript(
  tenantId: string,
  id: string
): Promise<Script | null> {
  return patchScriptStatus(tenantId, id, "archived");
}

// ----------------------------------------------------------------------------
// 辅助：批量按 id 取话术（多对多 join 时用得到，留给后续）
// ----------------------------------------------------------------------------
export async function listScriptsByIds(
  tenantId: string,
  ids: string[]
): Promise<Script[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(scripts)
    .where(
      and(
        inArray(scripts.id, ids),
        eq(scripts.tenantId, tenantId),
        isNull(scripts.deletedAt)
      )
    )
    .orderBy(asc(scripts.id));
}
