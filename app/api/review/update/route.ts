import { type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { errorBook, questions } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";

const updateSchema = z.object({
  errorBookId: z.string().uuid("无效的错题记录 ID"),
  selectedAnswer: z.enum(["A", "B", "C", "D"], {
    message: "答案必须是 A/B/C/D",
  }),
});

/** 间隔复习时间（小时）：24h → 72h → 168h */
const REVIEW_INTERVALS_HOURS = [24, 72, 168];

/**
 * POST /api/review/update
 * 复习结果更新：连对3次移出错题本，否则调整间隔
 */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    const { errorBookId, selectedAnswer } = parsed.data;

    // 查找错题记录（必须属于当前用户且未移出）
    const [entry] = await db
      .select()
      .from(errorBook)
      .where(
        and(
          eq(errorBook.id, errorBookId),
          eq(errorBook.userId, user.id),
          eq(errorBook.isResolved, false)
        )
      )
      .limit(1);

    if (!entry) {
      return errorResponse(
        "错题记录不存在或已掌握",
        ErrorCode.NOT_FOUND
      );
    }

    // 查找对应题目以判断答案
    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, entry.questionId!))
      .limit(1);

    if (!question) {
      return errorResponse("关联题目不存在", ErrorCode.NOT_FOUND);
    }

    const isCorrect = selectedAnswer === question.correctAnswer;
    const currentStreak = entry.correctStreak ?? 0;
    const currentReviewCount = entry.reviewCount ?? 0;

    if (isCorrect) {
      const newStreak = currentStreak + 1;

      if (newStreak >= 3) {
        // 连对3次，移出错题本
        await db
          .update(errorBook)
          .set({
            correctStreak: newStreak,
            reviewCount: currentReviewCount + 1,
            isResolved: true,
            updatedAt: new Date(),
          })
          .where(eq(errorBook.id, errorBookId));

        return successResponse({
          isCorrect: true,
          correctAnswer: question.correctAnswer,
          explanations: question.explanations,
          resolved: true,
          correctStreak: newStreak,
          message: "恭喜！已连续答对3次，该题已从错题本移出",
        });
      }

      // 答对但未达3次，增加间隔
      const hours = REVIEW_INTERVALS_HOURS[newStreak - 1] ?? 168;
      const nextReviewAt = new Date(Date.now() + hours * 3600000);

      await db
        .update(errorBook)
        .set({
          correctStreak: newStreak,
          reviewCount: currentReviewCount + 1,
          nextReviewAt,
          updatedAt: new Date(),
        })
        .where(eq(errorBook.id, errorBookId));

      return successResponse({
        isCorrect: true,
        correctAnswer: question.correctAnswer,
        explanations: question.explanations,
        resolved: false,
        correctStreak: newStreak,
        nextReviewAt: nextReviewAt.toISOString(),
        message: `答对了！还需连续答对 ${3 - newStreak} 次即可掌握`,
      });
    }

    // 答错：重置连对次数，恢复初始间隔
    const nextReviewAt = new Date(
      Date.now() + REVIEW_INTERVALS_HOURS[0] * 3600000
    );

    await db
      .update(errorBook)
      .set({
        correctStreak: 0,
        reviewCount: currentReviewCount + 1,
        nextReviewAt,
        updatedAt: new Date(),
      })
      .where(eq(errorBook.id, errorBookId));

    return successResponse({
      isCorrect: false,
      correctAnswer: question.correctAnswer,
      explanations: question.explanations,
      resolved: false,
      correctStreak: 0,
      nextReviewAt: nextReviewAt.toISOString(),
      message: "答错了，连续正确次数已重置",
    });
  } catch {
    return errorResponse("更新复习结果失败", ErrorCode.DATABASE_ERROR);
  }
});
