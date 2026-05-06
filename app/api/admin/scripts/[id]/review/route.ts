import { type NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { reviewScriptSchema } from "@/lib/validations/script";
import {
  updateScript,
  patchScriptStatus,
  type UpdateScriptInput,
} from "@/lib/services/scripts/repository";
import { ScriptStateTransitionError } from "@/lib/services/scripts/state-machine";

/**
 * POST /api/admin/scripts/[id]/review（unit44）
 *
 * 用途：主管审核话术。
 *  - action='approve' [+ edits]：可选 updateScript 应用 edits → 状态机 pending_review → published
 *  - action='reject' + rejectReason：状态机 pending_review → rejected
 *
 * 权限：仅 manager 可访问（withAuth allowedRoles=['manager']）
 *
 * 校验：
 *  - 路径 id 必须为 UUID
 *  - body 走 reviewScriptSchema discriminatedUnion('action')：approve 可选 edits，reject 必填 rejectReason
 *  - edits 字段长度（title 200 / customerQuestion 2000 / answer 10000）由 zod 兜底
 *
 * 错误：
 *  - 400 VALIDATION_ERROR：路径/body 校验失败 / 状态机非法跳转
 *  - 404 NOT_FOUND：service 层 update/patch 返回 null
 *  - 500 DATABASE_ERROR：DB 异常
 *
 * 设计原则：
 *  - approve 时若提供 edits：先 update（事务内同步标签）→ 再 patch 状态机切换；
 *    若 update 不存在 → 404，不再 patch
 *  - 状态机硬拦截：非 pending_review 来源不能 → published / rejected
 *  - tenantId 仅来自 session.user，避免越权
 *
 * 注：v1 reject 仅切状态机；rejectReason 字段未持久化到 DB（schema 已有 reject_reason TEXT 字段，
 * 但 service patchScriptStatus 不写该字段）。Phase 2 收尾如需展示拒绝原因，需扩展 service。
 */

const idSchema = z.string().uuid("话术 ID 必须是合法的 UUID");

export const POST = withAuth(
  async (req: NextRequest, { user, params }) => {
    // 1) 校验路径 id
    const rawId = params?.id;
    const parsedId = idSchema.safeParse(rawId);
    if (!parsedId.success) {
      const message = parsedId.error.issues.map((i) => i.message).join("; ");
      return errorResponse(
        message || "缺少话术 ID",
        ErrorCode.VALIDATION_ERROR
      );
    }
    const id = parsedId.data;

    // 2) 解析 body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("请求体非法 JSON", ErrorCode.VALIDATION_ERROR);
    }

    const parsed = reviewScriptSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    // 3) 分支：approve / reject
    if (parsed.data.action === "approve") {
      // 3a) 可选 edits → updateScript 先应用编辑
      if (parsed.data.edits) {
        const edits = parsed.data.edits;
        const updateInput: UpdateScriptInput = {};
        if (edits.title !== undefined) updateInput.title = edits.title;
        if (edits.customerQuestion !== undefined)
          updateInput.customerQuestion = edits.customerQuestion;
        if (edits.answer !== undefined) updateInput.answer = edits.answer;
        if (edits.sceneTagIds !== undefined)
          updateInput.sceneTagIds = edits.sceneTagIds;
        if (edits.productTagIds !== undefined)
          updateInput.productTagIds = edits.productTagIds;

        try {
          const updated = await updateScript(user.tenantId, id, updateInput);
          if (!updated) {
            return errorResponse("话术不存在", ErrorCode.NOT_FOUND);
          }
        } catch {
          return errorResponse("应用审核编辑失败", ErrorCode.DATABASE_ERROR);
        }
      }

      // 3b) 状态机：pending_review → published
      try {
        const result = await patchScriptStatus(user.tenantId, id, "published");
        if (!result) {
          return errorResponse("话术不存在", ErrorCode.NOT_FOUND);
        }
        return successResponse(result);
      } catch (err) {
        if (err instanceof ScriptStateTransitionError) {
          return errorResponse(err.message, ErrorCode.VALIDATION_ERROR);
        }
        return errorResponse("审核通过失败", ErrorCode.DATABASE_ERROR);
      }
    }

    // 3c) reject：状态机 pending_review → rejected
    // rejectReason 已通过 zod 校验非空；v1 暂不持久化（service 未支持）
    try {
      const result = await patchScriptStatus(user.tenantId, id, "rejected");
      if (!result) {
        return errorResponse("话术不存在", ErrorCode.NOT_FOUND);
      }
      return successResponse(result);
    } catch (err) {
      if (err instanceof ScriptStateTransitionError) {
        return errorResponse(err.message, ErrorCode.VALIDATION_ERROR);
      }
      return errorResponse("驳回失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);
