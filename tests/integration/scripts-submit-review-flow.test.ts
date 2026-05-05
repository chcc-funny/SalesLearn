import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试（unit45 端到端串联）：submit → review approve → archive
 *
 * 场景：员工提交 AI 草稿审核 → 主管审核通过 → 主管将已发布话术下架（archived）
 *
 * 用途：
 *  - 锁定 Phase 2 提交-审核闭环主路径不被回退
 *  - 验证状态机三段切换：draft → pending_review → published → archived
 *  - 验证三个路由共享 tenantId（多租户隔离）
 *
 * Mock 策略（与 scripts-submit / admin-scripts-review / admin-scripts-archive 同构）：
 *  - lib/services/scripts/repository 整模块 mock；createScript / patchScriptStatus / archiveScript
 *  - lib/services/scripts/state-machine：复刻 ScriptStateTransitionError
 *  - lib/auth/guard：根据 currentUser 角色路由
 *  - lib/rate-limit：放行
 */

const {
  mockEmployee,
  mockManager,
  mockCreateScript,
  mockPatchScriptStatus,
  mockArchiveScript,
  mockCheckRateLimit,
  ScriptStateTransitionError,
} = vi.hoisted(() => {
  const mockEmployee = {
    id: "user-emp-1",
    name: "员工",
    email: "emp@example.com",
    role: "employee",
    tenantId: "tenant-1",
  };
  const mockManager = {
    id: "user-mgr-1",
    name: "主管",
    email: "mgr@example.com",
    role: "manager",
    tenantId: "tenant-1",
  };
  class ScriptStateTransitionError extends Error {
    from: string;
    to: string;
    constructor(from: string, to: string) {
      super(`非法的话术状态转移：${from} → ${to}`);
      this.name = "ScriptStateTransitionError";
      this.from = from;
      this.to = to;
      Object.setPrototypeOf(this, ScriptStateTransitionError.prototype);
    }
  }
  return {
    mockEmployee,
    mockManager,
    mockCreateScript: vi.fn(),
    mockPatchScriptStatus: vi.fn(),
    mockArchiveScript: vi.fn(),
    mockCheckRateLimit: vi.fn(),
    ScriptStateTransitionError,
  };
});

let currentUser: typeof mockEmployee = mockEmployee;

vi.mock("@/lib/services/scripts/repository", () => ({
  createScript: mockCreateScript,
  patchScriptStatus: mockPatchScriptStatus,
  archiveScript: mockArchiveScript,
  // updateScript 在 review approve 无 edits 路径不调用，给个空 mock 兜底
  updateScript: vi.fn(),
}));

vi.mock("@/lib/services/scripts/state-machine", () => ({
  ScriptStateTransitionError,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  getRateLimitType: vi.fn(() => "llm"),
}));

type Handler = (
  req: NextRequest,
  ctx: { user: typeof mockEmployee; params?: Record<string, string> }
) => Promise<Response>;

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Handler, allowedRoles?: string[]) => {
    return async (
      req: NextRequest,
      ctx?: { params?: Promise<Record<string, string>> }
    ) => {
      if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
        const { errorResponse, ErrorCode } = await import(
          "@/lib/api-response"
        );
        return errorResponse("权限不足，无法访问", ErrorCode.FORBIDDEN);
      }
      const params = ctx?.params ? await ctx.params : undefined;
      return handler(req, { user: currentUser, params });
    };
  }),
}));

import { POST as submitPOST } from "@/app/api/scripts/submit/route";
import { POST as reviewPOST } from "@/app/api/admin/scripts/[id]/review/route";
import { POST as archivePOST } from "@/app/api/admin/scripts/[id]/archive/route";

const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const SCRIPT_ID = "66666666-6666-4666-8666-666666666666";

function makeJson(url: string, body: unknown): NextRequest {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validSubmitBody = {
  requestId: REQUEST_ID,
  title: "AI 生成 - 贴膜推荐",
  customerQuestion: "贴膜什么牌子好",
  answer: "推荐量子膜（AI 生成）",
};

const draftRecord = {
  id: SCRIPT_ID,
  tenantId: "tenant-1",
  title: validSubmitBody.title,
  customerQuestion: validSubmitBody.customerQuestion,
  answer: validSubmitBody.answer,
  questionAliases: [],
  source: "ai_submitted",
  knowledgeId: null,
  status: "draft" as const,
  usageCount: 0,
  createdBy: "user-emp-1",
  reviewedBy: null,
  reviewedAt: null,
  rejectReason: null,
  submissionRequestId: REQUEST_ID,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  tagIds: [],
};

describe("Submit → Review → Archive 端到端串联（unit45）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  });

  it("员工 submit → 主管 approve → 主管 archive：状态机三段全绿", async () => {
    // ---------------- Stage 1: 员工 submit ----------------
    currentUser = mockEmployee;
    mockCreateScript.mockResolvedValueOnce(draftRecord);
    mockPatchScriptStatus.mockResolvedValueOnce({
      ...draftRecord,
      status: "pending_review",
    });

    const submitRes = await submitPOST(
      makeJson("http://localhost/api/scripts/submit", validSubmitBody),
      {}
    );
    const submitJson = await submitRes.json();

    expect(submitRes.status).toBe(200);
    expect(submitJson.success).toBe(true);
    expect(submitJson.data.status).toBe("pending_review");
    expect(submitJson.data.id).toBe(SCRIPT_ID);

    // 状态机第 1 段：draft → pending_review
    expect(mockPatchScriptStatus).toHaveBeenCalledTimes(1);
    expect(mockPatchScriptStatus).toHaveBeenLastCalledWith(
      "tenant-1",
      SCRIPT_ID,
      "pending_review"
    );

    // ---------------- Stage 2: 主管 approve ----------------
    currentUser = mockManager;
    mockPatchScriptStatus.mockResolvedValueOnce({
      ...draftRecord,
      status: "published",
      reviewedBy: "user-mgr-1",
    });

    const approveRes = await reviewPOST(
      makeJson(
        `http://localhost/api/admin/scripts/${SCRIPT_ID}/review`,
        { action: "approve" }
      ),
      { params: Promise.resolve({ id: SCRIPT_ID }) }
    );
    const approveJson = await approveRes.json();

    expect(approveRes.status).toBe(200);
    expect(approveJson.data.status).toBe("published");

    // 状态机第 2 段：pending_review → published
    expect(mockPatchScriptStatus).toHaveBeenCalledTimes(2);
    expect(mockPatchScriptStatus).toHaveBeenLastCalledWith(
      "tenant-1",
      SCRIPT_ID,
      "published"
    );

    // ---------------- Stage 3: 主管 archive ----------------
    mockArchiveScript.mockResolvedValueOnce({
      ...draftRecord,
      status: "archived",
    });

    const archiveRes = await archivePOST(
      makeJson(
        `http://localhost/api/admin/scripts/${SCRIPT_ID}/archive`,
        {}
      ),
      { params: Promise.resolve({ id: SCRIPT_ID }) }
    );
    const archiveJson = await archiveRes.json();

    expect(archiveRes.status).toBe(200);
    expect(archiveJson.data.status).toBe("archived");

    // 状态机第 3 段：published → archived（archive service 内部状态机）
    expect(mockArchiveScript).toHaveBeenCalledTimes(1);
    expect(mockArchiveScript).toHaveBeenCalledWith("tenant-1", SCRIPT_ID);

    // 多租户隔离：三段调用都用主管/员工各自 session 的 tenantId（同租户 tenant-1）
    expect(mockCreateScript.mock.calls[0][0]).toBe("tenant-1");
  });

  it("员工 submit → 主管 reject：状态机第 2 段切到 rejected", async () => {
    currentUser = mockEmployee;
    mockCreateScript.mockResolvedValueOnce(draftRecord);
    mockPatchScriptStatus.mockResolvedValueOnce({
      ...draftRecord,
      status: "pending_review",
    });

    const submitRes = await submitPOST(
      makeJson("http://localhost/api/scripts/submit", validSubmitBody),
      {}
    );
    expect(submitRes.status).toBe(200);

    currentUser = mockManager;
    mockPatchScriptStatus.mockResolvedValueOnce({
      ...draftRecord,
      status: "rejected",
      rejectReason: "答案不准确",
    });

    const rejectRes = await reviewPOST(
      makeJson(
        `http://localhost/api/admin/scripts/${SCRIPT_ID}/review`,
        { action: "reject", rejectReason: "答案不准确" }
      ),
      { params: Promise.resolve({ id: SCRIPT_ID }) }
    );
    const rejectJson = await rejectRes.json();

    expect(rejectRes.status).toBe(200);
    expect(rejectJson.data.status).toBe("rejected");
    expect(mockPatchScriptStatus).toHaveBeenLastCalledWith(
      "tenant-1",
      SCRIPT_ID,
      "rejected"
    );

    // archived 路径不应触发
    expect(mockArchiveScript).not.toHaveBeenCalled();
  });
});
