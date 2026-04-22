import { type NextRequest } from "next/server";
import { eq, and, lte, desc, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { errorBook, questions, knowledgeBase } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";

/**
 * GET /api/review/list?tab=pending|resolved
 * 错题本列表：待复习 / 已掌握
 */
export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") ?? "pending";

  try {
    const conditions = [eq(errorBook.userId, user.id)];

    if (tab === "pending") {
      conditions.push(eq(errorBook.isResolved, false));
    } else {
      conditions.push(eq(errorBook.isResolved, true));
    }

    const items = await db
      .select({
        id: errorBook.id,
        questionId: errorBook.questionId,
        knowledgeId: errorBook.knowledgeId,
        knowledgeTitle: knowledgeBase.title,
        questionText: questions.questionText,
        options: questions.options,
        correctAnswer: questions.correctAnswer,
        explanations: questions.explanations,
        questionType: questions.type,
        nextReviewAt: errorBook.nextReviewAt,
        reviewCount: errorBook.reviewCount,
        correctStreak: errorBook.correctStreak,
        isResolved: errorBook.isResolved,
        createdAt: errorBook.createdAt,
      })
      .from(errorBook)
      .leftJoin(questions, eq(errorBook.questionId, questions.id))
      .leftJoin(knowledgeBase, eq(errorBook.knowledgeId, knowledgeBase.id))
      .where(and(...conditions))
      .orderBy(
        tab === "pending"
          ? asc(errorBook.nextReviewAt)
          : desc(errorBook.updatedAt)
      )
      .limit(100);

    // 计算待复习数量（nextReviewAt <= now）
    const now = new Date();
    const dueCount =
      tab === "pending"
        ? items.filter(
            (item) =>
              item.nextReviewAt && new Date(item.nextReviewAt) <= now
          ).length
        : 0;

    return successResponse({
      items,
      total: items.length,
      dueCount,
    });
  } catch {
    return errorResponse("获取错题本失败", ErrorCode.DATABASE_ERROR);
  }
});
