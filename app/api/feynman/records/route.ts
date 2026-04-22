import { type NextRequest } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { userFeynmanRecords, knowledgeBase } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";

/**
 * GET /api/feynman/records?knowledgeId=xxx
 * Get the current user's feynman records.
 * If knowledgeId is provided, returns records for that knowledge point only.
 * Otherwise returns all records grouped summary.
 */
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const knowledgeId = searchParams.get("knowledgeId");

    if (knowledgeId) {
      // Get records for a specific knowledge point
      const records = await db
        .select({
          id: userFeynmanRecords.id,
          stage: userFeynmanRecords.stage,
          totalScore: userFeynmanRecords.totalScore,
          isPassed: userFeynmanRecords.isPassed,
          createdAt: userFeynmanRecords.createdAt,
        })
        .from(userFeynmanRecords)
        .where(
          and(
            eq(userFeynmanRecords.userId, user.id),
            eq(userFeynmanRecords.knowledgeId, knowledgeId)
          )
        )
        .orderBy(desc(userFeynmanRecords.createdAt))
        .limit(20);

      return successResponse({ records });
    }

    // Get summary: best score per knowledge point
    const records = await db
      .select({
        id: userFeynmanRecords.id,
        knowledgeId: userFeynmanRecords.knowledgeId,
        knowledgeTitle: knowledgeBase.title,
        stage: userFeynmanRecords.stage,
        totalScore: userFeynmanRecords.totalScore,
        isPassed: userFeynmanRecords.isPassed,
        createdAt: userFeynmanRecords.createdAt,
      })
      .from(userFeynmanRecords)
      .leftJoin(
        knowledgeBase,
        eq(userFeynmanRecords.knowledgeId, knowledgeBase.id)
      )
      .where(eq(userFeynmanRecords.userId, user.id))
      .orderBy(desc(userFeynmanRecords.createdAt))
      .limit(100);

    return successResponse({ records });
  } catch {
    return errorResponse("获取费曼记录失败", ErrorCode.DATABASE_ERROR);
  }
});
