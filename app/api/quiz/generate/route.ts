import { type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { knowledgeBase, questions } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { chatCompletionJSON, LLM_MODELS } from "@/lib/llm/openrouter";
import {
  QUIZ_SYSTEM_PROMPT,
  QUIZ_FEW_SHOT,
  buildQuizUserPrompt,
} from "@/lib/llm/quiz-prompt";

const generateSchema = z.object({
  knowledgeId: z.string().uuid("无效的知识点 ID"),
  count: z.number().int().min(1).max(20).default(5),
  types: z
    .array(z.enum(["memory", "understanding", "application", "analysis"]))
    .default(["memory", "understanding", "application", "analysis"]),
});

interface GeneratedQuestion {
  type: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  explanations: Record<string, string>;
}

const VALID_ANSWERS = ["A", "B", "C", "D"];
const VALID_TYPES = ["memory", "understanding", "application", "analysis"];

export const POST = withAuth(
  async (req: NextRequest, { user }) => {
    try {
      const body = await req.json();
      const parsed = generateSchema.safeParse(body);

      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join("; ");
        return errorResponse(message, ErrorCode.VALIDATION_ERROR);
      }

      const { knowledgeId, count, types } = parsed.data;

      // 获取知识点
      const [knowledge] = await db
        .select()
        .from(knowledgeBase)
        .where(
          and(
            eq(knowledgeBase.id, knowledgeId),
            eq(knowledgeBase.tenantId, user.tenantId)
          )
        )
        .limit(1);

      if (!knowledge) {
        return errorResponse("知识点不存在", ErrorCode.NOT_FOUND);
      }

      // 调用 Kimi K2 生成题目
      const { data } = await chatCompletionJSON<{
        questions: GeneratedQuestion[];
      }>({
        model: LLM_MODELS.KIMI_K2,
        messages: [
          { role: "system", content: QUIZ_SYSTEM_PROMPT },
          { role: "user", content: QUIZ_FEW_SHOT },
          {
            role: "assistant",
            content: "好的，我已理解出题要求和格式。请提供知识点内容。",
          },
          {
            role: "user",
            content: buildQuizUserPrompt({
              title: knowledge.title,
              keyPoints: Array.isArray(knowledge.keyPoints)
                ? (knowledge.keyPoints as string[])
                : [],
              content: knowledge.content,
              commonMistakes: knowledge.commonMistakes,
              count,
              types,
            }),
          },
        ],
        temperature: 0.5,
        maxTokens: 8192,
      });

      const rawQuestions = data.questions;

      if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
        return errorResponse("AI 未能生成题目", ErrorCode.LLM_ERROR);
      }

      // 校验并写入数据库
      const validRows = rawQuestions
        .filter(
          (q) =>
            q.question_text &&
            Array.isArray(q.options) &&
            q.options.length === 4 &&
            VALID_ANSWERS.includes(q.correct_answer)
        )
        .map((q) => ({
          tenantId: user.tenantId,
          knowledgeId,
          type: VALID_TYPES.includes(q.type) ? q.type : "memory",
          questionText: String(q.question_text),
          options: q.options,
          correctAnswer: q.correct_answer,
          explanations: q.explanations ?? {},
          status: "reviewing" as const,
        }));

      if (validRows.length === 0) {
        return errorResponse("生成的题目格式不合规", ErrorCode.LLM_ERROR);
      }

      const inserted = await db
        .insert(questions)
        .values(validRows)
        .returning();

      return successResponse({
        generated: inserted.length,
        questions: inserted,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "AI 出题失败";
      return errorResponse(message, ErrorCode.LLM_ERROR);
    }
  },
  ["manager"]
);
