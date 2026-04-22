import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { getTask } from "@/lib/llm/tasks";

export const GET = withAuth(
  async (_req: NextRequest, { user, params }) => {
    const taskId = params?.taskId;
    if (!taskId) {
      return errorResponse("缺少任务 ID", ErrorCode.VALIDATION_ERROR);
    }

    const task = getTask(taskId);

    if (!task) {
      return errorResponse("任务不存在", ErrorCode.NOT_FOUND);
    }

    // 租户隔离
    if (task.tenantId !== user.tenantId) {
      return errorResponse("任务不存在", ErrorCode.NOT_FOUND);
    }

    return successResponse({
      id: task.id,
      status: task.status,
      originalFileName: task.originalFileName,
      knowledgeIds: task.knowledgeIds,
      error: task.error,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    });
  },
  ["manager"]
);
