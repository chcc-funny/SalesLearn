import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { uploadFile } from "@/lib/storage/blob";
import { processFileWithAI } from "@/lib/llm/split-knowledge";
import { LLM_MODELS, type ModelId } from "@/lib/llm/openrouter";

const VALID_MODELS = new Set<string>(Object.values(LLM_MODELS));

export const maxDuration = 60;

export const POST = withAuth(
  async (req: NextRequest, { user }) => {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const category = formData.get("category") as string | null;
      const modelRaw = formData.get("model") as string | null;
      if (modelRaw && !VALID_MODELS.has(modelRaw)) {
        return errorResponse(`不支持的模型: ${modelRaw}`, ErrorCode.VALIDATION_ERROR);
      }
      const model = (modelRaw as ModelId) || undefined;

      if (!file) {
        return errorResponse("请选择要上传的文件", ErrorCode.VALIDATION_ERROR);
      }

      // 1. 上传文件到 Vercel Blob
      const uploadResult = await uploadFile(file, "knowledge-uploads");
      const fileContent = await file.text();
      const fileName = file.name;

      // 2. 流式响应：用心跳保持连接，防止 Vercel/浏览器超时
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          // 每 5 秒发心跳
          const heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode("data: {\"type\":\"heartbeat\"}\n\n"));
            } catch {
              clearInterval(heartbeat);
            }
          }, 5000);

          try {
            const knowledgeIds = await processFileWithAI({
              fileUrl: uploadResult.url,
              fileName,
              fileContent,
              tenantId: user.tenantId,
              createdBy: user.id,
              category: category ?? undefined,
              model,
            });

            clearInterval(heartbeat);

            const result = JSON.stringify({
              type: "completed",
              data: { originalFileName: fileName, knowledgeIds, status: "completed" },
            });
            controller.enqueue(encoder.encode(`data: ${result}\n\n`));
          } catch (err) {
            clearInterval(heartbeat);

            const message = err instanceof Error ? err.message : "AI 切分失败";
            const error = JSON.stringify({ type: "error", error: message });
            controller.enqueue(encoder.encode(`data: ${error}\n\n`));
          }

          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "文件上传失败";
      return errorResponse(message, ErrorCode.STORAGE_ERROR);
    }
  },
  ["manager"]
);
