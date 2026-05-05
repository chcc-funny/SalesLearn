import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { getScriptById } from "@/lib/services/scripts/repository";

/**
 * GET /api/scripts/:id
 *
 * 查询单条话术详情：
 *  - 员工：仅可见 `status='published'` 或 `created_by = self.id`
 *  - 主管：可读全部（含 draft / pending_review / archived）
 *  - 跨租户 / 已软删 / 不存在 → 404 NOT_FOUND（统一 not_found 语义，避免泄露存在性）
 *
 * 鉴权：withAuth 默认任意登录用户可访问；员工的可读范围在 handler 内裁剪
 *
 * Response：
 *  - 200 successResponse(scriptWithTags)
 *  - 400 VALIDATION_ERROR 缺少 id
 *  - 401 UNAUTHORIZED 未登录（withAuth）
 *  - 404 NOT_FOUND 不存在 / 越权 / 软删 / 员工读非自己的非发布话术
 *  - 500 DATABASE_ERROR
 */
export const GET = withAuth(async (_req: NextRequest, { user, params }) => {
  const id = params?.id;
  if (!id) {
    return errorResponse("缺少话术 ID", ErrorCode.VALIDATION_ERROR);
  }

  try {
    const script = await getScriptById(id, user.tenantId);
    if (!script) {
      return errorResponse("话术不存在", ErrorCode.NOT_FOUND);
    }

    // 员工可读范围裁剪：published 或自己创建的
    if (
      user.role === "employee" &&
      script.status !== "published" &&
      script.createdBy !== user.id
    ) {
      return errorResponse("话术不存在", ErrorCode.NOT_FOUND);
    }

    return successResponse(script);
  } catch {
    return errorResponse("获取话术详情失败", ErrorCode.DATABASE_ERROR);
  }
});
