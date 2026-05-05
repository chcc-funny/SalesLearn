import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { updateScriptSchema } from "@/lib/validations/script";
import {
  updateScript,
  softDeleteScript,
  type UpdateScriptInput,
} from "@/lib/services/scripts/repository";

/**
 * 管理端 /api/admin/scripts/[id]
 *
 * 权限：仅 manager 可访问（withAuth allowedRoles=['manager']）
 *
 * PUT：更新话术（不改 status；状态切换走 review / archive 接口）
 *  - zod 校验：updateScriptSchema 至少要有一个字段
 *  - tenant 隔离：service 层 WHERE tenant_id = session.user.tenantId
 *  - 不存在 / 跨租户 → 404
 *  - 标签关系按需重写（service 内事务）
 *
 * DELETE：软删（置 deleted_at = NOW()）
 *  - 不存在 / 跨租户 → 404
 *  - 状态保留不变（删除不改状态机）
 */

export const PUT = withAuth(
  async (req: NextRequest, { user, params }) => {
    const id = params?.id;
    if (!id) {
      return errorResponse("缺少话术 ID", ErrorCode.VALIDATION_ERROR);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("请求体非法 JSON", ErrorCode.VALIDATION_ERROR);
    }

    const parsed = updateScriptSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    // 严格仅透传 update schema 已知字段（多余字段被 zod 忽略，例如 status / tenantId）
    const input: UpdateScriptInput = {};
    if (parsed.data.title !== undefined) input.title = parsed.data.title;
    if (parsed.data.customerQuestion !== undefined)
      input.customerQuestion = parsed.data.customerQuestion;
    if (parsed.data.answer !== undefined) input.answer = parsed.data.answer;
    if (parsed.data.questionAliases !== undefined)
      input.questionAliases = parsed.data.questionAliases;
    if (parsed.data.knowledgeId !== undefined)
      input.knowledgeId = parsed.data.knowledgeId ?? null;
    if (parsed.data.sceneTagIds !== undefined)
      input.sceneTagIds = parsed.data.sceneTagIds;
    if (parsed.data.productTagIds !== undefined)
      input.productTagIds = parsed.data.productTagIds;

    try {
      const updated = await updateScript(user.tenantId, id, input);
      if (!updated) {
        return errorResponse("话术不存在", ErrorCode.NOT_FOUND);
      }
      return successResponse(updated);
    } catch {
      return errorResponse("更新话术失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);

export const DELETE = withAuth(
  async (_req: NextRequest, { user, params }) => {
    const id = params?.id;
    if (!id) {
      return errorResponse("缺少话术 ID", ErrorCode.VALIDATION_ERROR);
    }

    try {
      const deleted = await softDeleteScript(user.tenantId, id);
      if (!deleted) {
        return errorResponse("话术不存在", ErrorCode.NOT_FOUND);
      }
      return successResponse({ deleted: true });
    } catch {
      return errorResponse("删除话术失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);
