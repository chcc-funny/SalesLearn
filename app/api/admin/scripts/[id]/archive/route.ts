import { type NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { archiveScript } from "@/lib/services/scripts/repository";
import { ScriptStateTransitionError } from "@/lib/services/scripts/state-machine";

/**
 * 管理端 /api/admin/scripts/[id]/archive
 *
 * 权限：仅 manager 可访问（withAuth allowedRoles=['manager']）
 *
 * POST：将话术置为 archived 状态
 *  - 复用 service.archiveScript（事务内 select → 状态机校验 → update）
 *  - 状态机要求 from='published'：其它来源（draft/pending_review/rejected/archived）→ 抛
 *    ScriptStateTransitionError → 路由层 400 VALIDATION_ERROR
 *  - 不存在 / 跨租户 / 已软删 → service 返回 null → 路由层 404 NOT_FOUND
 *
 * 与 DELETE /api/admin/scripts/[id] 的区别：
 *  - DELETE 是「软删」（置 deleted_at），与状态机无关，状态保留
 *  - POST archive 是「工作流状态切换」，走状态机闭环，记录被检索/审计可见
 *  两者语义不同，互不替代。
 */

const idSchema = z.string().uuid("话术 ID 必须是合法的 UUID");

export const POST = withAuth(
  async (_req: NextRequest, { user, params }) => {
    const rawId = params?.id;
    const parsedId = idSchema.safeParse(rawId);
    if (!parsedId.success) {
      const message = parsedId.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message || "缺少话术 ID", ErrorCode.VALIDATION_ERROR);
    }

    try {
      const archived = await archiveScript(user.tenantId, parsedId.data);
      if (!archived) {
        return errorResponse("话术不存在", ErrorCode.NOT_FOUND);
      }
      return successResponse(archived);
    } catch (err) {
      if (err instanceof ScriptStateTransitionError) {
        return errorResponse(err.message, ErrorCode.VALIDATION_ERROR);
      }
      return errorResponse("归档话术失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);
