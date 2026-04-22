import { type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { knowledgeBase, userFeynmanRecords } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { chatCompletionJSON, LLM_MODELS } from "@/lib/llm/openrouter";
import {
  FEYNMAN_SYSTEM_PROMPT,
  buildFeynmanUserPrompt,
  calculateTotalScore,
  canUnlockStageB,
  type FeynmanEvalResult,
} from "@/lib/llm/feynman-prompt";
import { checkTranscript } from "@/lib/validations/feynman-checks";

const evaluateSchema = z.object({
  knowledgeId: z.string().uuid("无效的知识点 ID"),
  transcript: z.string().min(1, "讲解内容不能为空"),
  audioUrl: z.string().url().optional(),
});

/**
 * POST /api/feynman/evaluate
 * AI evaluates a Feynman explanation using Claude Sonnet via OpenRouter.
 */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json();
    const parsed = evaluateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    const { knowledgeId, transcript, audioUrl } = parsed.data;

    // Fetch knowledge point
    const [knowledge] = await db
      .select()
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
      return errorResponse(
        "知识点不存在或未发布",
        ErrorCode.NOT_FOUND
      );
    }

    const keyPoints = (knowledge.keyPoints as string[]) ?? [];
    if (keyPoints.length === 0) {
      return errorResponse(
        "该知识点缺少核心要点，无法评分",
        ErrorCode.VALIDATION_ERROR
      );
    }

    // Pre-LLM edge case checks (saves LLM cost on invalid input)
    const check = checkTranscript(transcript, keyPoints);
    if (!check.valid) {
      const codeMap: Record<string, ErrorCode> = {
        blank: ErrorCode.FEYNMAN_TOO_SHORT,
        too_short: ErrorCode.FEYNMAN_TOO_SHORT,
        too_long: ErrorCode.VALIDATION_ERROR,
        gibberish: ErrorCode.VALIDATION_ERROR,
        off_topic: ErrorCode.VALIDATION_ERROR,
      };
      return errorResponse(
        check.message,
        codeMap[check.code] ?? ErrorCode.VALIDATION_ERROR
      );
    }

    // Call LLM for evaluation
    const userPrompt = buildFeynmanUserPrompt({
      title: knowledge.title,
      keyPoints,
      content: knowledge.content,
      examples: knowledge.examples,
      commonMistakes: knowledge.commonMistakes,
      transcript,
    });

    const { data: evalResult } = await chatCompletionJSON<FeynmanEvalResult>({
      model: LLM_MODELS.CLAUDE_SONNET,
      messages: [
        { role: "system", content: FEYNMAN_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 2048,
    });

    const totalScore = calculateTotalScore(evalResult.scores);
    const unlockStageB = canUnlockStageB(totalScore);

    // Save record to database
    const [record] = await db
      .insert(userFeynmanRecords)
      .values({
        userId: user.id,
        knowledgeId,
        stage: "A",
        audioUrl: audioUrl ?? null,
        transcript,
        scores: evalResult.scores,
        coveredPoints: evalResult.coveredPoints,
        missedPoints: evalResult.missedPoints,
        errors: evalResult.errors,
        aiFeedback: evalResult.suggestions,
        totalScore,
        isPassed: unlockStageB,
      })
      .returning();

    return successResponse({
      recordId: record.id,
      scores: evalResult.scores,
      totalScore,
      coveredPoints: evalResult.coveredPoints,
      missedPoints: evalResult.missedPoints,
      errors: evalResult.errors,
      suggestions: evalResult.suggestions,
      highlights: evalResult.highlights,
      canUnlockStageB: unlockStageB,
    });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("OpenRouter")
    ) {
      return errorResponse(
        "AI 评分服务暂时不可用，请稍后重试",
        ErrorCode.LLM_ERROR
      );
    }

    const message =
      err instanceof Error ? err.message : "评分失败";
    return errorResponse(message, ErrorCode.LLM_ERROR);
  }
});
