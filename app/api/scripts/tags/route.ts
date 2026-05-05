import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { listScriptTagsQuerySchema } from "@/lib/validations/script-tag";
import { listTags } from "@/lib/services/scripts/tags";
import {
  scriptTagGroupKeys,
  type ScriptTag,
  type ScriptTagGroupKey,
} from "@/lib/db/schema/script-tags";

/**
 * GET /api/scripts/tags
 *
 * 公开读：任何登录用户（员工 / 主管）都可拉取标签清单。
 *
 * Query：
 *  - groupKey   可选，按 group 过滤（scene / product）
 *  - onlyActive 可选，默认 true。员工端只看启用中的标签
 *
 * Response：
 *   { success: true, data: { scene: [...], product: [...] } }
 *
 * 与 README §4.2 对齐：返回值按 group 分组，便于前端两栏渲染。
 */
export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);

  // zod 校验 query
  const parsed = listScriptTagsQuerySchema.safeParse({
    groupKey: searchParams.get("groupKey") ?? undefined,
    onlyActive: searchParams.get("onlyActive") ?? undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ");
    return errorResponse(message, ErrorCode.VALIDATION_ERROR);
  }

  const { groupKey, onlyActive } = parsed.data;

  try {
    const tags = await listTags(user.tenantId, {
      groupKey,
      onlyActive,
    });

    // 按 group 分组返回（前端两栏渲染：scene / product）
    const grouped: Record<ScriptTagGroupKey, ScriptTag[]> = {
      scene: [],
      product: [],
    };
    for (const tag of tags) {
      const key = tag.groupKey as ScriptTagGroupKey;
      // 防御：未知 groupKey 跳过（DB 字段无 enum 约束，仅常量数组）
      if (scriptTagGroupKeys.includes(key)) {
        grouped[key].push(tag);
      }
    }

    return successResponse(grouped);
  } catch {
    return errorResponse("获取话术标签失败", ErrorCode.DATABASE_ERROR);
  }
});
