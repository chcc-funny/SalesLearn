import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import {
  createScriptTagSchema,
  listScriptTagsQuerySchema,
} from "@/lib/validations/script-tag";
import { listTags, createTag } from "@/lib/services/scripts/tags";

/**
 * 管理端 /api/admin/script-tags
 *
 * 权限：仅 manager 可访问（withAuth allowedRoles=['manager']）
 *
 * GET：列表查询
 *  - 可选 query：groupKey（scene / product）/ onlyActive（默认 true）
 *  - 跨租户隔离：service 内 WHERE tenant_id = session.user.tenantId
 *
 * POST：创建标签
 *  - body：groupKey / name / sortOrder?(默认 0) / isActive?(默认 true)
 *  - tenantId 强制使用 session.user.tenantId（body 中同名字段被忽略）
 *  - UNIQUE(tenant_id, group_key, name) 由 DB 兜底重复
 */

export const GET = withAuth(
  async (req: NextRequest, { user }) => {
    const { searchParams } = new URL(req.url);
    const parsed = listScriptTagsQuerySchema.safeParse({
      groupKey: searchParams.get("groupKey") ?? undefined,
      onlyActive: searchParams.get("onlyActive") ?? undefined,
    });

    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    try {
      const tags = await listTags(user.tenantId, {
        groupKey: parsed.data.groupKey,
        onlyActive: parsed.data.onlyActive,
      });
      return successResponse(tags);
    } catch {
      return errorResponse("获取标签列表失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);

export const POST = withAuth(
  async (req: NextRequest, { user }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("请求体非法 JSON", ErrorCode.VALIDATION_ERROR);
    }

    const parsed = createScriptTagSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    try {
      const created = await createTag(user.tenantId, {
        groupKey: parsed.data.groupKey,
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
      });
      return successResponse(created);
    } catch {
      return errorResponse("创建标签失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);
