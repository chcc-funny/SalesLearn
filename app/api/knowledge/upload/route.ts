import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { uploadFile } from "@/lib/storage/blob";
import { processFileWithAI } from "@/lib/llm/split-knowledge";
import { LLM_MODELS, type ModelId } from "@/lib/llm/openrouter";

const VALID_MODELS = new Set<string>(Object.values(LLM_MODELS));

/** Vercel 函数超时：最大 300s */
export const maxDuration = 120;

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

      // 2. 同步执行 AI 切分（await 确保 Vercel 不会提前回收函数）
      const knowledgeIds = await processFileWithAI({
        fileUrl: uploadResult.url,
        fileName: file.name,
        fileContent: await file.text(),
        tenantId: user.tenantId,
        createdBy: user.id,
        category: category ?? undefined,
        model,
      });

      // 3. 返回结果
      return successResponse({
        originalFileName: file.name,
        knowledgeIds,
        status: "completed" as const,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "文件上传失败";
      return errorResponse(message, ErrorCode.STORAGE_ERROR);
    }
  },
  ["manager"]
);
