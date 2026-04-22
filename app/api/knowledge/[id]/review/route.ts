import { type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { knowledgeBase } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"], {
    message: "操作必须是 approve 或 reject",
  }),
});

export const POST = withAuth(
  async (req: NextRequest, { user, params }) => {
    const id = params?.id;
    if (!id) {
      return errorResponse("缺少知识点 ID", ErrorCode.VALIDATION_ERROR);
    }

    try {
      const body = await req.json();
      const parsed = reviewSchema.safeParse(body);

      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join("; ");
        return errorResponse(message, ErrorCode.VALIDATION_ERROR);
      }

      const { action } = parsed.data;

      // 查找知识点
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

      // 仅 reviewing 状态可审核
      if (item.status !== "reviewing") {
        return errorResponse(
          `当前状态为「${item.status}」，仅「审核中」状态可审核`,
          ErrorCode.VALIDATION_ERROR
        );
      }

      const newStatus = action === "approve" ? "published" : "draft";

      const [updated] = await db
        .update(knowledgeBase)
        .set({
          status: newStatus,
          reviewedBy: user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(knowledgeBase.id, id))
        .returning();

      return successResponse(updated);
    } catch {
      return errorResponse("审核操作失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);
