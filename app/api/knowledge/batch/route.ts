import { type NextRequest } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeBase } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { batchKnowledgeSchema } from "@/lib/validations/knowledge";

interface PgError {
  code?: string;
}

function isForeignKeyError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as PgError).code;
  return code === "23503";
}

export const PATCH = withAuth(
  async (req: NextRequest, { user }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("请求体格式错误", ErrorCode.VALIDATION_ERROR);
    }

    const parsed = batchKnowledgeSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    const data = parsed.data;
    const tenantFilter = and(
      inArray(knowledgeBase.id, data.ids),
      eq(knowledgeBase.tenantId, user.tenantId)
    );

    try {
      if (data.action === "publish") {
        const updated = await db
          .update(knowledgeBase)
          .set({
            status: "published",
            reviewedBy: user.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(tenantFilter)
          .returning({ id: knowledgeBase.id });
        return successResponse({ affected: updated.length });
      }

      if (data.action === "setCategory") {
        const updated = await db
          .update(knowledgeBase)
          .set({
            category: data.category,
            updatedAt: new Date(),
          })
          .where(tenantFilter)
          .returning({ id: knowledgeBase.id });
        return successResponse({ affected: updated.length });
      }

      // delete
      const deleted = await db
        .delete(knowledgeBase)
        .where(tenantFilter)
        .returning({ id: knowledgeBase.id });
      return successResponse({ affected: deleted.length });
    } catch (err) {
      if (isForeignKeyError(err)) {
        return errorResponse(
          "存在被引用的知识点（关联习题/学习记录），整批操作已回滚，未删除任何条目；请先取消引用或单条删除",
          ErrorCode.VALIDATION_ERROR
        );
      }
      return errorResponse("批量操作失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);
