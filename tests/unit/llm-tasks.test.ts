import { describe, it, expect, beforeEach } from "vitest";
import { createTask, getTask, updateTask, type Task } from "@/lib/llm/tasks";

// ─────────────────────────────────────────────────────────────
// NOTE: tasks.ts uses a module-level Map as its store.
// Tests run sequentially in the same process, so the Map persists
// between tests within this file. Each test creates its own task
// with a fresh UUID to avoid cross-test pollution.
// ─────────────────────────────────────────────────────────────

const baseParams = {
  tenantId: "tenant-001",
  createdBy: "user-001",
  originalFileName: "培训资料.pdf",
  fileUrl: "https://example.com/file.pdf",
};

describe("createTask", () => {
  it("创建任务时初始状态为 processing", () => {
    const task = createTask(baseParams);
    expect(task.status).toBe("processing");
  });

  it("创建任务时 knowledgeIds 为空数组", () => {
    const task = createTask(baseParams);
    expect(task.knowledgeIds).toEqual([]);
  });

  it("每次创建都生成唯一 UUID", () => {
    const t1 = createTask(baseParams);
    const t2 = createTask(baseParams);
    expect(t1.id).not.toBe(t2.id);
  });

  it("携带 category 时保存到任务中", () => {
    const task = createTask({ ...baseParams, category: "product" });
    expect(task.category).toBe("product");
  });

  it("创建时记录 createdAt 时间戳", () => {
    const before = new Date();
    const task = createTask(baseParams);
    const after = new Date();
    expect(task.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(task.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe("getTask", () => {
  let createdTask: Task;

  beforeEach(() => {
    createdTask = createTask(baseParams);
  });

  it("已存在的 id 返回任务", () => {
    const result = getTask(createdTask.id);
    expect(result).toBeDefined();
    expect(result?.id).toBe(createdTask.id);
  });

  it("不存在的 id 返回 undefined", () => {
    expect(getTask("non-existent-id")).toBeUndefined();
  });
});

describe("updateTask", () => {
  let task: Task;

  beforeEach(() => {
    task = createTask(baseParams);
  });

  it("更新 status 为 completed", () => {
    const updated = updateTask(task.id, { status: "completed" });
    expect(updated?.status).toBe("completed");
  });

  it("更新 knowledgeIds 列表", () => {
    const ids = ["kb-001", "kb-002"];
    const updated = updateTask(task.id, { knowledgeIds: ids });
    expect(updated?.knowledgeIds).toEqual(ids);
  });

  it("更新 failed 状态并附带 error", () => {
    const updated = updateTask(task.id, {
      status: "failed",
      error: "LLM 调用超时",
      completedAt: new Date(),
    });
    expect(updated?.status).toBe("failed");
    expect(updated?.error).toBe("LLM 调用超时");
    expect(updated?.completedAt).toBeInstanceOf(Date);
  });

  it("不存在的 id 返回 undefined，不抛出", () => {
    const result = updateTask("does-not-exist", { status: "completed" });
    expect(result).toBeUndefined();
  });

  it("更新后持久化 —— getTask 可以读到更新结果", () => {
    updateTask(task.id, { status: "completed", knowledgeIds: ["kb-999"] });
    const fetched = getTask(task.id);
    expect(fetched?.status).toBe("completed");
    expect(fetched?.knowledgeIds).toContain("kb-999");
  });
});
