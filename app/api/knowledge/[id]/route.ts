import { type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeBase } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { updateKnowledgeSchema } from "@/lib/validations/knowledge";

export const GET = withAuth(async (_req: NextRequest, { user, params }) => {
  const id = params?.id;
  if (!id) {
    return errorResponse("缺少知识点 ID", ErrorCode.VALIDATION_ERROR);
  }

  try {
    const [item] = await db
      .select()
      .from(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.id, id),
          eq(knowledgeBase.tenantId, user.tenantId)
        )
      )
      .limit(1);

    if (!item) {
      return errorResponse("知识点不存在", ErrorCode.NOT_FOUND);
    }

    // 员工只能查看已发布的知识点
    if (user.role === "employee" && item.status !== "published") {
      return errorResponse("知识点不存在", ErrorCode.NOT_FOUND);
    }

    return successResponse(item);
  } catch {
    return errorResponse("获取知识点详情失败", ErrorCode.DATABASE_ERROR);
  }
});

export const PUT = withAuth(
  async (req: NextRequest, { user, params }) => {
    const id = params?.id;
    if (!id) {
      return errorResponse("缺少知识点 ID", ErrorCode.VALIDATION_ERROR);
    }

    try {
      const body = await req.json();
      const parsed = updateKnowledgeSchema.safeParse(body);

      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join("; ");
        return errorResponse(message, ErrorCode.VALIDATION_ERROR);
      }

      // 检查知识点是否存在且属于当前租户
      const [existing] = await db
        .select({ id: knowledgeBase.id })
        .from(knowledgeBase)
        .where(
          and(
            eq(knowledgeBase.id, id),
            eq(knowledgeBase.tenantId, user.tenantId)
          )
        )
        .limit(1);

      if (!existing) {
        return errorResponse("知识点不存在", ErrorCode.NOT_FOUND);
      }

      const [updated] = await db
        .update(knowledgeBase)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeBase.id, id))
        .returning();

      return successResponse(updated);
    } catch {
      return errorResponse("更新知识点失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);

export const DELETE = withAuth(
  async (_req: NextRequest, { user, params }) => {
    const id = params?.id;
    if (!id) {
      return errorResponse("缺少知识点 ID", ErrorCode.VALIDATION_ERROR);
    }

    try {
      const [existing] = await db
        .select({ id: knowledgeBase.id })
        .from(knowledgeBase)
        .where(
          and(
            eq(knowledgeBase.id, id),
            eq(knowledgeBase.tenantId, user.tenantId)
          )
        )
        .limit(1);

      if (!existing) {
        return errorResponse("知识点不存在", ErrorCode.NOT_FOUND);
      }

      await db
        .delete(knowledgeBase)
        .where(eq(knowledgeBase.id, id));

      return successResponse({ deleted: true });
    } catch {
      return errorResponse("删除知识点失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);
