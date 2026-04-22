import { type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { questions, knowledgeBase } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";

/**
 * GET /api/quiz/by-knowledge/[knowledgeId]
 * 获取某知识点的所有已发布题目（员工答题用）
 */
export const GET = withAuth(async (_req: NextRequest, { user, params }) => {
  const knowledgeId = params?.knowledgeId;
  if (!knowledgeId) {
    return errorResponse("缺少知识点 ID", ErrorCode.VALIDATION_ERROR);
  }

  try {
    // 验证知识点存在且已发布
    const [knowledge] = await db
      .select({ id: knowledgeBase.id, title: knowledgeBase.title })
      .from(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.id, knowledgeId),
          eq(knowledgeBase.tenantId, user.tenantId),
          eq(knowledgeBase.status, "published")
        )
      )
      .limit(1);

    if (!knowledge) {
      return errorResponse("知识点不存在或未发布", ErrorCode.NOT_FOUND);
    }

    // 获取已发布的题目
    const items = await db
      .select({
        id: questions.id,
        type: questions.type,
        questionText: questions.questionText,
        options: questions.options,
        correctAnswer: questions.correctAnswer,
        explanations: questions.explanations,
      })
      .from(questions)
      .where(
        and(
          eq(questions.knowledgeId, knowledgeId),
          eq(questions.tenantId, user.tenantId),
          eq(questions.status, "published")
        )
      );

    return successResponse({
      knowledgeId: knowledge.id,
      knowledgeTitle: knowledge.title,
      total: items.length,
      questions: items,
    });
  } catch {
    return errorResponse("获取题目失败", ErrorCode.DATABASE_ERROR);
  }
});
