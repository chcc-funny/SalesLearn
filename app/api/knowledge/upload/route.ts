import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { uploadFile } from "@/lib/storage/blob";
import { createTask, updateTask } from "@/lib/llm/tasks";
import { processFileWithAI } from "@/lib/llm/split-knowledge";
import { LLM_MODELS, type ModelId } from "@/lib/llm/openrouter";

const VALID_MODELS = new Set<string>(Object.values(LLM_MODELS));

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

      // 2. 创建任务记录
      const task = createTask({
        tenantId: user.tenantId,
        createdBy: user.id,
        originalFileName: file.name,
        fileUrl: uploadResult.url,
        category: category ?? undefined,
      });

      // 3. 异步触发 AI 切分（不 await，立即返回 taskId）
      processFileWithAI({
        taskId: task.id,
        fileUrl: uploadResult.url,
        fileName: file.name,
        fileContent: await file.text(),
        tenantId: user.tenantId,
        createdBy: user.id,
        category: category ?? undefined,
        model,
      }).catch((err) => {
        updateTask(task.id, {
          status: "failed",
          error: err instanceof Error ? err.message : "AI 切分失败",
          completedAt: new Date(),
        });
      });

      // 4. 同步返回 taskId
      return successResponse({
        taskId: task.id,
        originalFileName: file.name,
        status: "processing" as const,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "文件上传失败";
      return errorResponse(message, ErrorCode.STORAGE_ERROR);
    }
  },
  ["manager"]
);
