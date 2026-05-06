import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockManagerUser,
  mockEmployeeUser,
  mockSelect,
  mockUpdate,
  mockFrom,
  mockWhere,
  mockLimit,
  mockSet,
  mockReturning,
  wireChain,
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

  const mockReturning = vi.fn();
  const mockLimit = vi.fn();
  const mockSet = vi.fn();
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();

  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, where: mockWhere, returning: mockReturning });
    mockLimit.mockResolvedValue([]);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockReturning.mockResolvedValue([]);
  }

  wireChain();

  return {
    mockManagerUser,
    mockEmployeeUser,
    mockSelect,
    mockUpdate,
    mockFrom,
    mockWhere,
    mockLimit,
    mockSet,
    mockReturning,
    wireChain,
  };
});

// ---- Current role for withAuth mock ----
let currentUser = mockManagerUser;

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function, allowedRoles?: string[]) => {
    return async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) => {
      // 模拟未登录
      if (req.headers.get("x-test-unauth") === "1") {
        const { errorResponse, ErrorCode } = await import("@/lib/api-response");
        return errorResponse("未登录，请先登录", ErrorCode.UNAUTHORIZED);
      }
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

import { POST } from "@/app/api/quiz/[id]/review/route";

// ---- Constants ----
const VALID_QUESTION_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const VALID_KNOWLEDGE_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

// ---- Helpers ----
function makeContext(id = VALID_QUESTION_ID) {
  return { params: Promise.resolve({ id }) };
}

function makePostRequest(body: unknown, id = VALID_QUESTION_ID, unauth = false): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (unauth) headers["x-test-unauth"] = "1";
  return new Request(`http://localhost/api/quiz/${id}/review`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  }) as unknown as NextRequest;
}

const reviewingQuestion = {
  id: VALID_QUESTION_ID,
  tenantId: "tenant-0001",
  knowledgeId: VALID_KNOWLEDGE_ID,
  type: "memory",
  questionText: "镀晶的主要作用是什么？",
  options: ["保护漆面", "美化外观", "防腐蚀", "以上都是"],
  correctAnswer: "A",
  explanations: { A: "镀晶用于保护漆面" },
  status: "reviewing",
};

describe("POST /api/quiz/[id]/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockManagerUser;
  });

  it("未登录返回 401 UNAUTHORIZED", async () => {
    const req = makePostRequest({ action: "approve" }, VALID_QUESTION_ID, true);
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toContain("未登录");
  });

  it("员工角色调用审核接口返回 403 FORBIDDEN", async () => {
    currentUser = mockEmployeeUser;

    const req = makePostRequest({ action: "approve" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toContain("权限不足");
  });

  it("action 字段缺失返回 400 VALIDATION_ERROR", async () => {
    const req = makePostRequest({});
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("action 为非法值返回 400 VALIDATION_ERROR", async () => {
    const req = makePostRequest({ action: "skip" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
    expect(json.error).toContain("approve 或 reject");
  });

  it("options 不为 4 项时返回 400 VALIDATION_ERROR", async () => {
    const req = makePostRequest({
      action: "approve",
      options: ["只有两个", "选项"],
    });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("题目不存在返回 404 NOT_FOUND", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = makePostRequest({ action: "approve" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("题目不存在");
  });

  it("approve 操作：题目状态变为 published，返回更新后数据", async () => {
    mockLimit.mockResolvedValueOnce([reviewingQuestion]);
    const updatedQuestion = { ...reviewingQuestion, status: "published" };
    mockReturning.mockResolvedValueOnce([updatedQuestion]);

    const req = makePostRequest({ action: "approve" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("published");
    // 确认 set 被调用且包含 status: published
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "published" })
    );
  });

  it("reject 操作：题目状态变为 rejected，返回更新后数据", async () => {
    mockLimit.mockResolvedValueOnce([reviewingQuestion]);
    const updatedQuestion = { ...reviewingQuestion, status: "rejected" };
    mockReturning.mockResolvedValueOnce([updatedQuestion]);

    const req = makePostRequest({ action: "reject" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("rejected");
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected" })
    );
  });

  it("approve 时携带编辑字段（questionText/options/correctAnswer），更新内容同步写入", async () => {
    mockLimit.mockResolvedValueOnce([reviewingQuestion]);
    const updatedQuestion = {
      ...reviewingQuestion,
      status: "published",
      questionText: "更新后的题目文本",
      options: ["新选项A", "新选项B", "新选项C", "新选项D"],
      correctAnswer: "B",
    };
    mockReturning.mockResolvedValueOnce([updatedQuestion]);

    const req = makePostRequest({
      action: "approve",
      questionText: "更新后的题目文本",
      options: ["新选项A", "新选项B", "新选项C", "新选项D"],
      correctAnswer: "B",
    });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "published",
        questionText: "更新后的题目文本",
        correctAnswer: "B",
      })
    );
  });

  it("题目状态不是 reviewing（例如已 published）时，审核返回 400 VALIDATION_ERROR", async () => {
    const publishedQuestion = { ...reviewingQuestion, status: "published" };
    mockLimit.mockResolvedValueOnce([publishedQuestion]);

    const req = makePostRequest({ action: "approve" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("审核中");
  });

  it("tenantId 隔离：其他租户的题目不可审核，返回 404", async () => {
    // tenantId 条件不匹配时 where 过滤，找不到题目
    mockLimit.mockResolvedValueOnce([]);

    const req = makePostRequest({ action: "approve" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("数据库异常返回 500 DATABASE_ERROR", async () => {
    mockLimit.mockResolvedValueOnce([reviewingQuestion]);
    mockReturning.mockRejectedValueOnce(new Error("DB connection lost"));

    const req = makePostRequest({ action: "approve" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toContain("题目审核失败");
  });
});
