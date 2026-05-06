import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import {
  createScriptSchema,
  listScriptsQuerySchema,
} from "@/lib/validations/script";
import {
  listScripts,
  createScript,
  type ListScriptsFilters,
  type CreateScriptInput,
} from "@/lib/services/scripts/repository";

/**
 * 管理端 /api/admin/scripts
 *
 * 权限：仅 manager 可访问（withAuth allowedRoles=['manager']）
 *
 * GET：管理员视角列表
 *  - tenant 隔离强制
 *  - 不附 mineUserId（管理端可读全部状态：draft / pending_review / published / rejected / archived）
 *  - 透传 q / status / source / sceneTagIds / productTagIds / page / pageSize
 *
 * POST：创建话术
 *  - status 仅允许 draft / published（zod 限制；其它状态由 review/archive 接口流转）
 *  - tenantId / createdBy 强制使用 session.user，忽略 body 中可能的同名字段
 *  - 标签关系一并写入（service 层事务）
 */

export const GET = withAuth(
  async (req: NextRequest, { user }) => {
    const { searchParams } = new URL(req.url);
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

    const {
      q,
      status,
      source,
      sceneTagIds: sIds,
      productTagIds: pIds,
      page,
      pageSize,
    } = parsed.data;

    const filters: ListScriptsFilters = {
      q,
      source,
      sceneTagIds: sIds,
      productTagIds: pIds,
    };
    if (status) filters.status = status;

    try {
      const result = await listScripts(user.tenantId, filters, {
        page,
        pageSize,
      });
      return paginatedResponse(
        result.items,
        result.total,
        result.page,
        result.pageSize
      );
    } catch {
      return errorResponse("获取话术列表失败", ErrorCode.DATABASE_ERROR);
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

    const parsed = createScriptSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    // 强制使用 session.user 的 tenantId 与 id；忽略 body 中可能的同名字段（防越权）
    const input: CreateScriptInput = {
      title: parsed.data.title,
      customerQuestion: parsed.data.customerQuestion,
      answer: parsed.data.answer,
      questionAliases: parsed.data.questionAliases,
      source: parsed.data.source,
      knowledgeId: parsed.data.knowledgeId ?? null,
      status: parsed.data.status,
      sceneTagIds: parsed.data.sceneTagIds,
      productTagIds: parsed.data.productTagIds,
    };

    try {
      const created = await createScript(user.tenantId, user.id, input);
      return successResponse(created);
    } catch {
      return errorResponse("创建话术失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);
