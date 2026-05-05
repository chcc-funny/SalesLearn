import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { scripts } from "@/lib/db/schema/scripts";
import { scriptCopyLogs } from "@/lib/db/schema/script-copy-logs";

/**
 * 话术复制服务（lib/services/scripts/copy.ts）
 *
 * 职责：
 *  - 一键复制时原子自增 `usage_count`（仅 published + tenant + 未软删）
 *  - 写入 `script_copy_logs` 审计日志
 *  - 全程在 db.transaction 中执行，避免「自增成功但日志缺失」/「日志写入但实际失败」的不一致
 *
 * 设计原则（与 Batch 4 教训对齐）：
 *  - SQL 表达式自增（`usage_count + 1`），而非 select-then-update，避免并发竞态
 *  - 命中条件包含 status='published' / tenant_id / deleted_at IS NULL，
 *    任意一项不满足都会让 UPDATE 0 行 → 抛业务错误，且不写日志
 *  - 不接受外部传入的设备字段透传写库；schema v1 仅记录 tenant/script/user/copied_at
 *
 * 不做：
 *  - 鉴权（API 层 withAuth）
 *  - rate limit（API 层 lib/rate-limit.ts）
 */

/**
 * 业务错误：话术不可复制（未发布 / 跨租户 / 已软删 / 不存在）。
 * API 层捕获后返回 400 + VALIDATION_ERROR（保持与状态机错误风格一致）。
 */
export class ScriptCopyError extends Error {
  constructor(message = "话术不可复制：仅已发布的话术允许一键复制") {
    super(message);
    this.name = "ScriptCopyError";
    Object.setPrototypeOf(this, ScriptCopyError.prototype);
  }
}

/**
 * 复制来源（与 README §1 "复制 + log 写入" 对齐；扩展可加更多渠道）。
 */
export type CopySource = "web" | "mobile" | "admin";

export interface LogScriptCopyResult {
  /** 自增后的最新 usage_count */
  usageCount: number;
}

/**
 * 记录一次话术复制：原子自增 usage_count + 写 script_copy_logs。
 *
 * 失败语义：
 *  - 仅当目标话术满足「tenant_id=? AND id=? AND status='published' AND deleted_at IS NULL」时
 *    才会 UPDATE 1 行；否则 UPDATE 0 行 → 抛 ScriptCopyError（事务自动回滚，未写日志）。
 *
 * @param scriptId   要复制的话术 id
 * @param userId     操作人（来自 session.user.id）
 * @param tenantId   租户隔离（来自 session.user.tenantId）
 * @param source     复制渠道（默认 'web'）；当前 schema v1 不持久化此字段，仅留给上层埋点
 * @param deviceInfo 设备指纹（可选，v1 不入库；保留供 v2 扩展时使用）
 */
export async function logScriptCopy(
  scriptId: string,
  userId: string,
  tenantId: string,
  source: CopySource = "web",
  deviceInfo?: Record<string, unknown>
): Promise<LogScriptCopyResult> {
  // source / deviceInfo 当前 schema 不入库；显式声明形参以便 API 层无须修改时升级
  void source;
  void deviceInfo;

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(scripts)
      .set({
        // SQL 表达式：避免读后写竞态；同时刷 updatedAt
        usageCount: sql`${scripts.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(scripts.id, scriptId),
          eq(scripts.tenantId, tenantId),
          eq(scripts.status, "published"),
          isNull(scripts.deletedAt)
        )
      )
      .returning({
        id: scripts.id,
        usageCount: scripts.usageCount,
      });

    if (!updated) {
      // 抛错让事务回滚；外层 INSERT 不会执行
      throw new ScriptCopyError();
    }

    await tx.insert(scriptCopyLogs).values({
      tenantId,
      scriptId,
      userId,
    });

    return { usageCount: updated.usageCount };
  });
}
