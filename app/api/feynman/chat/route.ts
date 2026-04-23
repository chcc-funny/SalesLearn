import { type NextRequest } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { knowledgeBase, userFeynmanRecords } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import { errorResponse, ErrorCode } from "@/lib/api-response";
import { chatCompletionStream, LLM_MODELS } from "@/lib/llm/openrouter";
import {
  buildChatSystemPrompt,
  buildChatUserPrompt,
  type PersonaType,
  type ChatMessage,
  type KnowledgeContext,
} from "@/lib/llm/feynman-chat-prompt";

// ============================================================
// Request Schema
// ============================================================

const chatMessageSchema = z.object({
  role: z.enum(["ai", "user"]),
  content: z.string().min(1),
});

const chatRequestSchema = z.object({
  knowledgeId: z.string().uuid("无效的知识点 ID"),
  persona: z.enum(["beginner", "bargainer", "expert"]),
  chatHistory: z.array(chatMessageSchema).max(10, "对话历史超出限制"),
  userMessage: z.string().min(1, "消息不能为空").max(2000, "消息过长"),
});

// ============================================================
// Helper: validate request body
// ============================================================

function validateRequest(body: unknown) {
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false as const, error: message };
  }
  return { ok: true as const, data: parsed.data };
}

// ============================================================
// Helper: fetch published knowledge
// ============================================================

async function fetchPublishedKnowledge(knowledgeId: string, tenantId: string) {
  const [knowledge] = await db
    .select()
    .from(knowledgeBase)
    .where(
      and(
        eq(knowledgeBase.id, knowledgeId),
        eq(knowledgeBase.tenantId, tenantId),
        eq(knowledgeBase.status, "published")
      )
    )
    .limit(1);

  return knowledge ?? null;
}

// ============================================================
// Helper: check Stage A unlock
// ============================================================

async function hasPassedStageA(
  userId: string,
  knowledgeId: string
): Promise<boolean> {
  const [record] = await db
    .select({ totalScore: userFeynmanRecords.totalScore })
    .from(userFeynmanRecords)
    .where(
      and(
        eq(userFeynmanRecords.userId, userId),
        eq(userFeynmanRecords.knowledgeId, knowledgeId),
        eq(userFeynmanRecords.stage, "A")
      )
    )
    .orderBy(desc(userFeynmanRecords.createdAt))
    .limit(1);

  return (record?.totalScore ?? 0) >= 80;
}

// ============================================================
// Helper: convert chat history to LLM format
// ============================================================

function toLLMMessages(
  history: readonly ChatMessage[]
): Array<{ role: "user" | "assistant"; content: string }> {
  return history.map((msg) => ({
    role: msg.role === "ai" ? ("assistant" as const) : ("user" as const),
    content: msg.content,
  }));
}

// ============================================================
// Helper: build knowledge context
// ============================================================

function toKnowledgeContext(knowledge: {
  title: string;
  content: string;
  keyPoints: unknown;
  examples: string | null;
  commonMistakes: string | null;
}): KnowledgeContext {
  return {
    title: knowledge.title,
    content: knowledge.content,
    keyPoints: (knowledge.keyPoints as string[]) ?? [],
    examples: knowledge.examples,
    commonMistakes: knowledge.commonMistakes,
  };
}

// ============================================================
// Route Handler
// ============================================================

/**
 * POST /api/feynman/chat
 *
 * 费曼阶段 B — AI 客户追问对话（流式响应）
 * userMessage 为 "__START__" 时表示开始新对话，AI 先发起提问。
 */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  // 1. Parse & validate
  const body = await req.json();
  const validation = validateRequest(body);

  if (!validation.ok) {
    return errorResponse(validation.error, ErrorCode.VALIDATION_ERROR);
  }

  const { knowledgeId, persona, chatHistory, userMessage } = validation.data;

  try {
    // 2. Fetch knowledge
    const knowledge = await fetchPublishedKnowledge(
      knowledgeId,
      user.tenantId
    );

    if (!knowledge) {
      return errorResponse("知识点不存在或未发布", ErrorCode.NOT_FOUND);
    }

    // 3. Unlock check (every request)
    const unlocked = await hasPassedStageA(user.id, knowledgeId);
    // TODO: 错题本解锁路径 — 后续支持从错题本直接进入阶段 B
    if (!unlocked) {
      return errorResponse(
        "需要先完成阶段 A 评分且达到 80 分以上",
        ErrorCode.FORBIDDEN
      );
    }

    // 4. Build LLM messages
    const knowledgeCtx = toKnowledgeContext(knowledge);
    const systemPrompt = buildChatSystemPrompt(
      persona as PersonaType,
      knowledgeCtx
    );

    const llmMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      { role: "system", content: systemPrompt },
      ...toLLMMessages(chatHistory),
    ];

    // "__START__" means AI speaks first; otherwise append user message
    if (userMessage !== "__START__") {
      llmMessages.push({
        role: "user",
        content: buildChatUserPrompt(userMessage),
      });
    }

    // 5. Call LLM streaming
    const stream = await chatCompletionStream({
      model: LLM_MODELS.CLAUDE_SONNET,
      messages: llmMessages,
      temperature: 0.8,
    });

    // 6. Return streaming response
    // TODO: 后续可通过 TransformStream 在流结束时自动保存对话记录
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const isLLMError =
      err instanceof Error && err.message.includes("OpenRouter");
    const message = isLLMError
      ? "AI 对话服务暂时不可用，请稍后重试"
      : "对话请求失败";
    return errorResponse(message, ErrorCode.LLM_ERROR);
  }
});
