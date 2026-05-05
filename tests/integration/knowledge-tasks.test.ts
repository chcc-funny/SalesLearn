import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockManagerUser,
  mockEmployeeUser,
  mockGetTask,
  wireTask,
} = vi.hoisted(() => {
  const mockManagerUser = {
    id: "manager-0001",
    name: "主管用户",
    email: "manager@example.com",
    role: "manager",
    tenantId: "tenant-0001",
  };

  const mockEmployeeUser = {
    id: "user-0001",
    name: "员工用户",
    email: "employee@example.com",
    role: "employee",
    tenantId: "tenant-0001",
  };

  const mockGetTask = vi.fn();

  function wireTask() {
    mockGetTask.mockReturnValue(undefined);
  }

  wireTask();

  return { mockManagerUser, mockEmployeeUser, mockGetTask, wireTask };
});

// ---- Current role for withAuth mock ----
let currentUser = mockManagerUser;

vi.mock("@/lib/llm/tasks", () => ({
  getTask: mockGetTask,
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function, allowedRoles?: string[]) => {
    return async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) => {
      if (allowedRoles && allowedRoles.length > 0) {
        if (!allowedRoles.includes(currentUser.role)) {
          const { errorResponse, ErrorCode } = await import("@/lib/api-response");
          return errorResponse("权限不足，无法访问", ErrorCode.FORBIDDEN);
        }
      }
      const params = ctx?.params ? await ctx.params : undefined;
      return handler(req, { user: currentUser, params });
    };
  }),
}));

import { GET } from "@/app/api/knowledge/tasks/[taskId]/route";

const VALID_TASK_ID = "task-uuid-1234-5678-abcd";

function makeContext(taskId = VALID_TASK_ID) {
  return { params: Promise.resolve({ taskId }) };
}

function makeGetRequest(taskId = VALID_TASK_ID): NextRequest {
  return new Request(
    `http://localhost/api/knowledge/tasks/${taskId}`
  ) as unknown as NextRequest;
}

const sampleTask = {
  id: VALID_TASK_ID,
  status: "completed" as const,
  tenantId: "tenant-0001",
  createdBy: "manager-0001",
  originalFileName: "产品手册.pdf",
  fileUrl: "https://storage.example.com/产品手册.pdf",
  category: "product",
  knowledgeIds: ["k-001", "k-002", "k-003"],
  error: undefined,
  createdAt: new Date("2026-01-01T10:00:00Z"),
  completedAt: new Date("2026-01-01T10:05:00Z"),
};

describe("GET /api/knowledge/tasks/[taskId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireTask();
    currentUser = mockManagerUser;
  });

  // ---- 鉴权 ----

  it("员工角色访问 → 403 FORBIDDEN", async () => {
    currentUser = mockEmployeeUser;

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toContain("权限不足");
  });

  // ---- 任务不存在 ----

  it("任务不存在 → 404 NOT_FOUND", async () => {
    mockGetTask.mockReturnValueOnce(undefined);

    const req = makeGetRequest("nonexistent-task-id");
    const res = await GET(req, makeContext("nonexistent-task-id"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("任务不存在");
  });

  // ---- 租户隔离 ----

  it("跨租户访问（tenantId 不匹配）→ 404 NOT_FOUND", async () => {
    const otherTenantTask = { ...sampleTask, tenantId: "tenant-9999" };
    mockGetTask.mockReturnValueOnce(otherTenantTask);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("任务不存在");
  });

  // ---- 任务状态：processing ----

  it("任务状态 processing → 200，返回进度信息", async () => {
    const processingTask = {
      ...sampleTask,
      status: "processing" as const,
      knowledgeIds: [],
      completedAt: undefined,
    };
    mockGetTask.mockReturnValueOnce(processingTask);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("processing");
    expect(json.data.knowledgeIds).toEqual([]);
    expect(json.data.error).toBeUndefined();
  });

  // ---- 任务状态：completed ----

  it("任务状态 completed → 200，返回 knowledgeIds 列表", async () => {
    mockGetTask.mockReturnValueOnce(sampleTask);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(VALID_TASK_ID);
    expect(json.data.status).toBe("completed");
    expect(json.data.originalFileName).toBe("产品手册.pdf");
    expect(Array.isArray(json.data.knowledgeIds)).toBe(true);
    expect(json.data.knowledgeIds).toHaveLength(3);
    expect(json.data.completedAt).toBeDefined();
  });

  // ---- 任务状态：failed ----

  it("任务状态 failed → 200，返回 error 字段", async () => {
    const failedTask = {
      ...sampleTask,
      status: "failed" as const,
      knowledgeIds: [],
      error: "文件解析失败：不支持的格式",
      completedAt: undefined,
    };
    mockGetTask.mockReturnValueOnce(failedTask);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("failed");
    expect(json.data.error).toBe("文件解析失败：不支持的格式");
    expect(json.data.knowledgeIds).toEqual([]);
  });

  // ---- 字段完整性 ----

  it("返回字段完整：id / status / originalFileName / knowledgeIds / error / createdAt / completedAt", async () => {
    mockGetTask.mockReturnValueOnce(sampleTask);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    const data = json.data;
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("status");
    expect(data).toHaveProperty("originalFileName");
    expect(data).toHaveProperty("knowledgeIds");
    expect(data).toHaveProperty("createdAt");
    expect(data).toHaveProperty("completedAt");
    // error 在 completed 状态下应为 undefined（不污染响应）
    expect(data.error).toBeUndefined();
  });

  // ---- taskId 缺失（params 未携带 taskId）----
  // NOTE: withAuth mock 透传 params，当 taskId 为 undefined 时路由应返回 400 VALIDATION_ERROR

  it("params 缺少 taskId → 400 VALIDATION_ERROR", async () => {
    // 传入无效上下文，params 不含 taskId
    const ctx = { params: Promise.resolve({} as Record<string, string>) };

    const req = makeGetRequest("");
    const res = await GET(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("缺少任务 ID");
  });

  // ---- knowledgeIds 为空列表（completed 但无切分结果）----

  it("completed 任务 knowledgeIds 为空数组 → 200，正常返回", async () => {
    const emptyTask = { ...sampleTask, knowledgeIds: [] };
    mockGetTask.mockReturnValueOnce(emptyTask);

    const req = makeGetRequest();
    const res = await GET(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.knowledgeIds).toEqual([]);
  });

  // ---- getTask 被以正确 taskId 调用 ----

  it("调用 getTask 时传入正确的 taskId", async () => {
    mockGetTask.mockReturnValueOnce(sampleTask);

    const req = makeGetRequest();
    await GET(req, makeContext());

    expect(mockGetTask).toHaveBeenCalledWith(VALID_TASK_ID);
    expect(mockGetTask).toHaveBeenCalledTimes(1);
  });
});
