import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import {
  logScriptCopy,
  ScriptCopyError,
} from "@/lib/services/scripts/copy";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/scripts/:id/copy
 *
 * 一键复制话术：
 *  - 鉴权：仅登录员工/主管可调用（withAuth 默认）
 *  - 频率限制（用户级）：每用户每分钟 60 次（默认令牌桶 default 类别）
 *      复用 lib/rate-limit 的令牌桶；key 形如 `script-copy:user:<userId>`
 *      与 middleware 的 IP 级 default(60/min) 形成两层保护
 *      注：传入 "default" 字符串时会回退到 RATE_LIMITS.default = 60/min
 *  - 服务层 logScriptCopy 在事务中：原子自增 usage_count + 写 script_copy_logs
 *  - 复制失败语义统一：未发布 / 跨租户 / 软删 / 不存在 → ScriptCopyError → 400
 *
 * Response：
 *  - 200 successResponse({ usageCount })
 *  - 400 VALIDATION_ERROR 缺少 id / 不可复制
 *  - 401 UNAUTHORIZED 未登录（withAuth）
 *  - 429 RATE_LIMITED 用户级超频
 *  - 500 DATABASE_ERROR
 */
export const POST = withAuth(async (_req: NextRequest, { user, params }) => {
  const id = params?.id;
  if (!id) {
    return errorResponse("缺少话术 ID", ErrorCode.VALIDATION_ERROR);
  }

  // 用户级频率限制：默认 60/min（RATE_LIMITS.default 配置）
  // key 按用户隔离，避免与 middleware 的 IP key 串扰；超频返回 429
  // 后续可在 lib/rate-limit.ts 注册 'script-copy' 类别并降为 30/min 加严
  const rl = checkRateLimit(`script-copy:user:${user.id}`, "default");
  if (!rl.allowed) {
    return errorResponse(
      `复制过于频繁，请 ${rl.retryAfter}s 后再试`,
      ErrorCode.RATE_LIMITED
    );
  }

  try {
    const result = await logScriptCopy(id, user.id, user.tenantId);
    return successResponse({ usageCount: result.usageCount });
  } catch (err) {
    if (err instanceof ScriptCopyError) {
      return errorResponse(err.message, ErrorCode.VALIDATION_ERROR);
    }
    return errorResponse("复制话术失败", ErrorCode.DATABASE_ERROR);
  }
});
