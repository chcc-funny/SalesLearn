import { type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { questions, userTestRecords, errorBook } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";

const answerSchema = z.object({
  questionId: z.string().uuid("无效的题目 ID"),
  selectedAnswer: z.enum(["A", "B", "C", "D"], {
    message: "答案必须是 A/B/C/D",
  }),
  timeSpent: z.number().int().min(0).optional(),
});

/** 间隔复习初始间隔（小时） */
const INITIAL_REVIEW_HOURS = 24;

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json();
    const parsed = answerSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    const { questionId, selectedAnswer, timeSpent } = parsed.data;

    // 查找题目
    const [question] = await db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.id, questionId),
          eq(questions.tenantId, user.tenantId),
          eq(questions.status, "published")
        )
      )
      .limit(1);

    if (!question) {
      return errorResponse("题目不存在或未发布", ErrorCode.NOT_FOUND);
    }

    const isCorrect = selectedAnswer === question.correctAnswer;

    // 记录答题结果
    const [record] = await db
      .insert(userTestRecords)
      .values({
        userId: user.id,
        questionId,
        selectedAnswer,
        isCorrect,
        timeSpent: timeSpent ?? null,
      })
      .returning();

    // 答错自动入错题本
    if (!isCorrect) {
      await addToErrorBook(user.id, question.knowledgeId, questionId);
    } else {
      // 答对时更新错题本连对次数
      await updateErrorBookStreak(user.id, questionId);
    }

    return successResponse({
      isCorrect,
      correctAnswer: question.correctAnswer,
      explanations: question.explanations,
      recordId: record.id,
    });
  } catch {
    return errorResponse("提交答案失败", ErrorCode.DATABASE_ERROR);
  }
});

async function addToErrorBook(
  userId: string,
  knowledgeId: string,
  questionId: string
) {
  // 检查是否已在错题本中
  const [existing] = await db
    .select()
    .from(errorBook)
    .where(
      and(eq(errorBook.userId, userId), eq(errorBook.questionId, questionId))
    )
    .limit(1);

  if (existing) {
    // 重置连对次数，更新复习时间
    await db
      .update(errorBook)
      .set({
        correctStreak: 0,
        isResolved: false,
        nextReviewAt: new Date(Date.now() + INITIAL_REVIEW_HOURS * 3600000),
        updatedAt: new Date(),
      })
      .where(eq(errorBook.id, existing.id));
  } else {
    await db.insert(errorBook).values({
      userId,
      knowledgeId,
      questionId,
      nextReviewAt: new Date(Date.now() + INITIAL_REVIEW_HOURS * 3600000),
    });
  }
}

async function updateErrorBookStreak(userId: string, questionId: string) {
  const [existing] = await db
    .select()
    .from(errorBook)
    .where(
      and(
        eq(errorBook.userId, userId),
        eq(errorBook.questionId, questionId),
        eq(errorBook.isResolved, false)
      )
    )
    .limit(1);

  if (!existing) return;

  const newStreak = (existing.correctStreak ?? 0) + 1;

  if (newStreak >= 3) {
    // 连对3次，移出错题本
    await db
      .update(errorBook)
      .set({ correctStreak: newStreak, isResolved: true, updatedAt: new Date() })
      .where(eq(errorBook.id, existing.id));
  } else {
    // 增加间隔（指数退避：24h → 72h → 168h）
    const intervals = [24, 72, 168];
    const hours = intervals[newStreak - 1] ?? 168;
    await db
      .update(errorBook)
      .set({
        correctStreak: newStreak,
        reviewCount: (existing.reviewCount ?? 0) + 1,
        nextReviewAt: new Date(Date.now() + hours * 3600000),
        updatedAt: new Date(),
      })
      .where(eq(errorBook.id, existing.id));
  }
}
