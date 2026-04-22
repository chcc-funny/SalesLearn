import { type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { questions } from "@/lib/db/schema";
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
  /** 可选：审核时编辑题目内容 */
  questionText: z.string().min(1).optional(),
  options: z.array(z.string()).length(4).optional(),
  correctAnswer: z.enum(["A", "B", "C", "D"]).optional(),
  explanations: z.record(z.string(), z.string()).optional(),
});

export const POST = withAuth(
  async (req: NextRequest, { user, params }) => {
    const id = params?.id;
    if (!id) {
      return errorResponse("缺少题目 ID", ErrorCode.VALIDATION_ERROR);
    }

    try {
      const body = await req.json();
      const parsed = reviewSchema.safeParse(body);

      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join("; ");
        return errorResponse(message, ErrorCode.VALIDATION_ERROR);
      }

      const { action, questionText, options, correctAnswer, explanations } =
        parsed.data;

      // 查找题目
      const [item] = await db
        .select()
        .from(questions)
        .where(
          and(
            eq(questions.id, id),
            eq(questions.tenantId, user.tenantId)
          )
        )
        .limit(1);

      if (!item) {
        return errorResponse("题目不存在", ErrorCode.NOT_FOUND);
      }

      if (item.status !== "reviewing") {
        return errorResponse(
          `当前状态为「${item.status}」，仅「审核中」状态可审核`,
          ErrorCode.VALIDATION_ERROR
        );
      }

      const newStatus = action === "approve" ? "published" : "rejected";

      const updates: Record<string, unknown> = {
        status: newStatus,
        updatedAt: new Date(),
      };

      // 审核时可编辑题目
      if (questionText) updates.questionText = questionText;
      if (options) updates.options = options;
      if (correctAnswer) updates.correctAnswer = correctAnswer;
      if (explanations) updates.explanations = explanations;

      const [updated] = await db
        .update(questions)
        .set(updates)
        .where(eq(questions.id, id))
        .returning();

      return successResponse(updated);
    } catch {
      return errorResponse("题目审核失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);
