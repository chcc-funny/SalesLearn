import { type NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { updateScriptTagSchema } from "@/lib/validations/script-tag";
import { updateTag, softDeleteTag } from "@/lib/services/scripts/tags";

/**
 * 管理端 /api/admin/script-tags/[id]
 *
 * 权限：仅 manager 可访问（withAuth allowedRoles=['manager']）
 *
 * PUT：更新标签
 *  - 仅允许改 name / sortOrder / isActive；不允许跨 group 改组（updateScriptTagSchema 不暴露 groupKey）
 *  - 不存在 / 跨租户 → 404
 *
 * DELETE：软删
 *  - 置 is_active=false；保留历史 script_tag_relations
 *  - 不存在 / 跨租户 → 404
 *  - 与 scripts 的 DELETE（软删 deleted_at）类似，但语义是「停用标签」而非「删除记录」，
 *    标签删除不走状态机（标签无工作流状态）
 */

const idSchema = z.string().uuid("标签 ID 必须是合法的 UUID");

export const PUT = withAuth(
  async (req: NextRequest, { user, params }) => {
    const parsedId = idSchema.safeParse(params?.id);
    if (!parsedId.success) {
      return errorResponse(
        parsedId.error.issues.map((i) => i.message).join("; ") ||
          "缺少标签 ID",
        ErrorCode.VALIDATION_ERROR
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("请求体非法 JSON", ErrorCode.VALIDATION_ERROR);
    }

    const parsed = updateScriptTagSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    // 严格仅透传 zod 已知字段（groupKey / tenantId 等多余字段被丢弃）
    const input: { name?: string; sortOrder?: number; isActive?: boolean } = {};
    if (parsed.data.name !== undefined) input.name = parsed.data.name;
    if (parsed.data.sortOrder !== undefined)
      input.sortOrder = parsed.data.sortOrder;
    if (parsed.data.isActive !== undefined)
      input.isActive = parsed.data.isActive;

    try {
      const updated = await updateTag(user.tenantId, parsedId.data, input);
      if (!updated) {
        return errorResponse("标签不存在", ErrorCode.NOT_FOUND);
      }
      return successResponse(updated);
    } catch {
      return errorResponse("更新标签失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);

export const DELETE = withAuth(
  async (_req: NextRequest, { user, params }) => {
    const parsedId = idSchema.safeParse(params?.id);
    if (!parsedId.success) {
      return errorResponse(
        parsedId.error.issues.map((i) => i.message).join("; ") ||
          "缺少标签 ID",
        ErrorCode.VALIDATION_ERROR
      );
    }

    try {
      const deleted = await softDeleteTag(user.tenantId, parsedId.data);
      if (!deleted) {
        return errorResponse("标签不存在", ErrorCode.NOT_FOUND);
      }
      return successResponse({ deleted: true, tag: deleted });
    } catch {
      return errorResponse("删除标签失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);
