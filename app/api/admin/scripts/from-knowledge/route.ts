import { type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { db } from "@/lib/db";
import { knowledgeBase } from "@/lib/db/schema/knowledge-base";
import {
  createScript,
  type CreateScriptInput,
} from "@/lib/services/scripts/repository";

/**
 * 管理端 /api/admin/scripts/from-knowledge
 *
 * 权限：仅 manager 可访问
 *
 * POST：基于知识库切片生成 draft 话术
 *  - 输入：knowledgeId（UUID） + 可选 sceneTagIds / productTagIds
 *  - 业务（MVP，不调 AI）：
 *      1) 按 (id, tenantId) 取 knowledge 行；找不到（不存在或跨租户）→ 404
 *      2) 复制 knowledge.title → script.title / customer_question
 *         复制 knowledge.content → script.answer
 *      3) source='from_knowledge'，status='draft'，knowledgeId 关联回知识切片
 *      4) 调 service.createScript 入库（事务内同步标签关系）
 *  - 跨租户安全：tenantId 仅来自 session.user，body 中的 tenantId 被忽略
 *  - body 中的 source/status 也被忽略，强制 from_knowledge / draft
 */

const SCRIPT_TITLE_MAX = 200;

const fromKnowledgeBodySchema = z.object({
  knowledgeId: z.string().uuid("knowledgeId 必须是合法的 UUID"),
  sceneTagIds: z
    .array(z.string().uuid("标签 ID 必须是合法的 UUID"))
    .max(20, "单条话术最多关联 20 个标签")
    .default([]),
  productTagIds: z
    .array(z.string().uuid("标签 ID 必须是合法的 UUID"))
    .max(20, "单条话术最多关联 20 个标签")
    .default([]),
});

export const POST = withAuth(
  async (req: NextRequest, { user }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("请求体非法 JSON", ErrorCode.VALIDATION_ERROR);
    }

    const parsed = fromKnowledgeBodySchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    const { knowledgeId, sceneTagIds, productTagIds } = parsed.data;

    try {
      // 1) 按 (id, tenantId) 取知识切片：跨租户/不存在统一 404
      const rows = await db
        .select()
        .from(knowledgeBase)
        .where(
          and(
            eq(knowledgeBase.id, knowledgeId),
            eq(knowledgeBase.tenantId, user.tenantId)
          )
        );

      const knowledge = rows[0];
      if (!knowledge) {
        return errorResponse("知识切片不存在", ErrorCode.NOT_FOUND);
      }

      // 2) 复制内容字段 → draft 话术
      // title 截断到 200 字（schema VARCHAR(200) 限制；MVP 直接 slice，不调 AI 改写）
      const titleSource = (knowledge.title ?? "").slice(0, SCRIPT_TITLE_MAX);

      const input: CreateScriptInput = {
        title: titleSource,
        // MVP：customer_question 与 title 同源，便于后续 trgm 检索；上层可在编辑页改写
        customerQuestion: titleSource,
        answer: knowledge.content ?? "",
        questionAliases: [],
        source: "from_knowledge",
        knowledgeId,
        status: "draft",
        sceneTagIds,
        productTagIds,
      };

      const created = await createScript(user.tenantId, user.id, input);
      return successResponse(created);
    } catch {
      return errorResponse(
        "从知识库生成话术失败",
        ErrorCode.DATABASE_ERROR
      );
    }
  },
  ["manager"]
);
