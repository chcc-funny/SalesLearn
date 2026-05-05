import { type NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { generateScriptSchema } from "@/lib/validations/script";
import { searchOrGenerateScripts } from "@/lib/services/scripts/orchestrator";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/scripts/generate（unit42）
 *
 * 用途：员工/主管粘贴客户问题，调编排服务（unit41）做精选检索 + 兜底生成。
 *
 * 鉴权：
 *  - withAuth 默认（不限制 role）：员工 / 主管均可调用
 *
 * 频率限制：
 *  - LLM 类别（10/min/user，复用 RATE_LIMITS.llm）
 *  - key 按 user.id 隔离，避免与 IP 级 default 桶串扰
 *
 * 入参（zod 校验）：
 *  - customerQuestion: 1..500 字（generateScriptSchema 已硬限）
 *  - sceneTagId / productTagId（可选 UUID）
 *
 * 出参：
 *  - 200 successResponse({ source, items, degraded?, generateError? })
 *      四种 source：'curated' | 'mixed' | 'generated' | 'empty'
 *  - 400 VALIDATION_ERROR：请求体非法 / 字段越界 / 标签非 UUID
 *  - 401 UNAUTHORIZED：未登录
 *  - 429 RATE_LIMITED：超过 10/min 桶
 *
 * 顺手修 Batch 14 MEDIUM：在调用 orchestrator 前后加 try/catch，
 * rerank/generate 失败时优雅降级（HTTP 200 + source='empty' + generateError）。
 */

// 路由层叠加可选标签校验（generateScriptSchema 仅约束 customerQuestion）
const tagIdSchema = z.string().uuid("标签 ID 必须是合法的 UUID");

const generateBodySchema = generateScriptSchema.extend({
  sceneTagId: tagIdSchema.optional(),
  productTagId: tagIdSchema.optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  // 1) 限流：LLM 类别（10/min/user）
  const rl = checkRateLimit(`script-generate:user:${user.id}`, "llm");
  if (!rl.allowed) {
    return errorResponse(
      `请求过于频繁，请 ${rl.retryAfter}s 后再试`,
      ErrorCode.RATE_LIMITED
    );
  }

  // 2) 解析 body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("请求体非法 JSON", ErrorCode.VALIDATION_ERROR);
  }

  const parsed = generateBodySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ");
    return errorResponse(message, ErrorCode.VALIDATION_ERROR);
  }

  // 3) 调编排（多租户隔离 tenantId 仅来自 session.user）
  // 顺手修 Batch 14 MEDIUM：try/catch 二次保护，rerank/generate 失败时优雅降级
  try {
    const result = await searchOrGenerateScripts({
      tenantId: user.tenantId,
      customerQuestion: parsed.data.customerQuestion,
      sceneTagId: parsed.data.sceneTagId,
      productTagId: parsed.data.productTagId,
    });

    return successResponse(result);
  } catch (err) {
    // 编排内部已对 rerank / generate 各自降级；这里兜底任何未捕获错误（如 DB 连接断）
    // 返回 200 + source='empty' + generateError 提示，前端展示「AI 暂时不可用」
    const message = err instanceof Error ? err.message : String(err);
    return successResponse({
      source: "empty" as const,
      items: [],
      generateError: message,
    });
  }
});
