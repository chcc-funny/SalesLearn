/**
 * 异步任务状态管理（内存存储，MVP 阶段）
 *
 * 用于跟踪 AI 切分等长时间运行任务的进度
 */

export type TaskStatus = "processing" | "completed" | "failed";

export interface Task {
  id: string;
  status: TaskStatus;
  tenantId: string;
  createdBy: string;
  originalFileName: string;
  fileUrl: string;
  category?: string;
  /** 已切分的知识点 ID 列表 */
  knowledgeIds: string[];
  /** 错误信息（仅 failed 时有值）*/
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/** 内存任务存储 */
const taskStore = new Map<string, Task>();

export function createTask(params: {
  tenantId: string;
  createdBy: string;
  originalFileName: string;
  fileUrl: string;
  category?: string;
}): Task {
  const id = crypto.randomUUID();
  const task: Task = {
    id,
    status: "processing",
    tenantId: params.tenantId,
    createdBy: params.createdBy,
    originalFileName: params.originalFileName,
    fileUrl: params.fileUrl,
    category: params.category,
    knowledgeIds: [],
    createdAt: new Date(),
  };
  taskStore.set(id, task);
  return task;
}

export function getTask(id: string): Task | undefined {
  return taskStore.get(id);
}

export function updateTask(
  id: string,
  updates: Partial<Pick<Task, "status" | "knowledgeIds" | "error" | "completedAt">>
): Task | undefined {
  const task = taskStore.get(id);
  if (!task) return undefined;

  const updated: Task = { ...task, ...updates };
  taskStore.set(id, updated);
  return updated;
}
