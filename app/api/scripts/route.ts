import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  paginatedResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { listScriptsQuerySchema } from "@/lib/validations/script";
import {
  listScripts,
  type ListScriptsFilters,
} from "@/lib/services/scripts/repository";

/**
 * GET /api/scripts
 *
 * 列表查询：
 *  - 员工：仅可见 `status='published'` 或 `created_by = self.id`（自己提交的草稿/待审）
 *  - 主管：可读全部（含 draft / pending_review / archived），由 query.status 决定
 *
 * Query（zod 校验，对齐 listScriptsQuerySchema）：
 *  - q                关键词（trgm 双字段 OR）
 *  - status           过滤状态（员工端任意 status 都会被强制叠加 OR self 语义）
 *  - source           过滤来源
 *  - sceneTagIds[]    场景标签 IDs（v1 服务层暂未 join，预留）
 *  - productTagIds[]  产品标签 IDs（v1 服务层暂未 join，预留）
 *  - page / pageSize  分页（默认 1 / 20，pageSize 上限 100）
 *
 * Response：
 *  - 200 paginatedResponse(items, total, page, pageSize)
 *  - 400 VALIDATION_ERROR query 不合法
 *  - 401 UNAUTHORIZED 未登录（withAuth 处理）
 */
export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);

  // 多值参数收集
  const sceneTagIds = searchParams.getAll("sceneTagIds");
  const productTagIds = searchParams.getAll("productTagIds");

  const parsed = listScriptsQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    source: searchParams.get("source") ?? undefined,
    sceneTagIds: sceneTagIds.length > 0 ? sceneTagIds : undefined,
    productTagIds: productTagIds.length > 0 ? productTagIds : undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ");
    return errorResponse(message, ErrorCode.VALIDATION_ERROR);
  }

  const { q, status, source, sceneTagIds: sIds, productTagIds: pIds, page, pageSize } =
    parsed.data;

  // 员工：强制员工端语义。如果 query 没显式带 status，默认锁定 published；
  //       同时叠加 OR self.id 让员工看见自己提交但还未发布的话术
  // 主管：直接尊重 query.status（可缺省）
  const filters: ListScriptsFilters = {
    q,
    source,
    sceneTagIds: sIds,
    productTagIds: pIds,
  };

  if (user.role === "employee") {
    filters.status = status ?? "published";
    filters.mineUserId = user.id;
  } else {
    if (status) filters.status = status;
  }

  try {
    const result = await listScripts(user.tenantId, filters, { page, pageSize });
    return paginatedResponse(result.items, result.total, result.page, result.pageSize);
  } catch {
    return errorResponse("获取话术列表失败", ErrorCode.DATABASE_ERROR);
  }
});
