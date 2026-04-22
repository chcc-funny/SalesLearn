import { type NextRequest } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { questions, knowledgeBase } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const knowledgeId = searchParams.get("knowledgeId");

  try {
    const conditions = [eq(questions.tenantId, user.tenantId)];

    if (status) {
      conditions.push(eq(questions.status, status));
    }

    if (knowledgeId) {
      conditions.push(eq(questions.knowledgeId, knowledgeId));
    }

    const items = await db
      .select({
        id: questions.id,
        knowledgeId: questions.knowledgeId,
        knowledgeTitle: knowledgeBase.title,
        type: questions.type,
        questionText: questions.questionText,
        options: questions.options,
        correctAnswer: questions.correctAnswer,
        explanations: questions.explanations,
        status: questions.status,
        createdAt: questions.createdAt,
      })
      .from(questions)
      .leftJoin(knowledgeBase, eq(questions.knowledgeId, knowledgeBase.id))
      .where(and(...conditions))
      .orderBy(desc(questions.createdAt))
      .limit(100);

    return successResponse(items);
  } catch {
    return errorResponse("获取题目列表失败", ErrorCode.DATABASE_ERROR);
  }
});
