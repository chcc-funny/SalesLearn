import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：POST /api/admin/scripts/[id]/review（unit44）
 *
 * 用途：主管审核话术。action='approve' → published；action='reject' → rejected。
 *  - approve 可附带 edits，先调 updateScript 应用编辑，再调 patchScriptStatus → published
 *  - reject 必须给 rejectReason；先调 updateScript 写入 rejectReason 字段不必要（schema reject_reason TEXT），
 *    交由路由层在 patchScriptStatus 同时通过 service 层写入；v1 简化为：reject = patch 状态 + 调 service 写 rejectReason
 *
 * 覆盖：
 *  - approve 成功（无 edits）→ patchScriptStatus 调一次（pending_review → published）
 *  - approve 成功（有 edits）→ updateScript 调一次 + patchScriptStatus 调一次
 *  - reject 成功 → 状态切到 rejected，rejectReason 持久化
 *  - 状态机非法跳转 → 400 VALIDATION_ERROR
 *  - 不存在 → 404
 *  - 缺 id → 400
 *  - 缺 action → 400
 *  - reject 缺 rejectReason → 400
 *  - 校验：edits 字段超长 → 400
 *  - 角色限制：员工调用 → 403 FORBIDDEN
 *  - DB 异常 → 500
 *  - 401 未登录黑盒契约
 */

const {
  mockEmployee,
  mockManager,
  mockUpdateScript,
  mockPatchScriptStatus,
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
  // 复刻业务异常类
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
    mockUpdateScript: vi.fn(),
    mockPatchScriptStatus: vi.fn(),
    ScriptStateTransitionError,
  };
});

let currentUser: typeof mockEmployee = mockManager;

vi.mock("@/lib/services/scripts/repository", () => ({
  updateScript: mockUpdateScript,
  patchScriptStatus: mockPatchScriptStatus,
}));

vi.mock("@/lib/services/scripts/state-machine", () => ({
  ScriptStateTransitionError,
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

import { POST } from "@/app/api/admin/scripts/[id]/review/route";

const SCRIPT_ID = "00000000-0000-4000-8000-000000000001";

function makeRequest(body: unknown): NextRequest {
  return new Request(
    `http://localhost/api/admin/scripts/${SCRIPT_ID}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }
  ) as unknown as NextRequest;
}

function makeContext(id = SCRIPT_ID) {
  return { params: Promise.resolve({ id }) };
}

const baseScript = {
  id: SCRIPT_ID,
  tenantId: "tenant-1",
  title: "AI 草稿",
  customerQuestion: "贴膜什么牌子好",
  answer: "推荐量子膜",
  questionAliases: [],
  source: "ai_submitted",
  knowledgeId: null,
  status: "pending_review",
  usageCount: 0,
  createdBy: "user-emp-1",
  reviewedBy: null,
  reviewedAt: null,
  rejectReason: null,
  submissionRequestId: "33333333-3333-4333-8333-333333333333",
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  tagIds: [],
};

describe("POST /api/admin/scripts/[id]/review (unit44)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManager;
  });

  describe("approve", () => {
    it("approve 无 edits → 状态机 pending_review → published，updateScript 不调", async () => {
      mockPatchScriptStatus.mockResolvedValueOnce({
        ...baseScript,
        status: "published",
      });

      const res = await POST(makeRequest({ action: "approve" }), makeContext());
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("published");

      expect(mockUpdateScript).not.toHaveBeenCalled();
      expect(mockPatchScriptStatus).toHaveBeenCalledTimes(1);
      expect(mockPatchScriptStatus).toHaveBeenCalledWith(
        "tenant-1",
        SCRIPT_ID,
        "published"
      );
    });

    it("approve 带 edits → 先 updateScript 再 patchScriptStatus", async () => {
      mockUpdateScript.mockResolvedValueOnce({
        ...baseScript,
        title: "主管修订标题",
      });
      mockPatchScriptStatus.mockResolvedValueOnce({
        ...baseScript,
        title: "主管修订标题",
        status: "published",
      });

      const res = await POST(
        makeRequest({
          action: "approve",
          edits: {
            title: "主管修订标题",
            answer: "主管修订答案",
          },
        }),
        makeContext()
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.status).toBe("published");
      expect(json.data.title).toBe("主管修订标题");

      expect(mockUpdateScript).toHaveBeenCalledTimes(1);
      const [tenantId, id, input] = mockUpdateScript.mock.calls[0];
      expect(tenantId).toBe("tenant-1");
      expect(id).toBe(SCRIPT_ID);
      expect(input.title).toBe("主管修订标题");
      expect(input.answer).toBe("主管修订答案");

      expect(mockPatchScriptStatus).toHaveBeenCalledTimes(1);
      expect(mockPatchScriptStatus).toHaveBeenCalledWith(
        "tenant-1",
        SCRIPT_ID,
        "published"
      );
    });

    it("approve edits 中 title 超长 → 400 VALIDATION_ERROR", async () => {
      const res = await POST(
        makeRequest({
          action: "approve",
          edits: { title: "贴".repeat(300) },
        }),
        makeContext()
      );
      expect(res.status).toBe(400);
      expect(mockUpdateScript).not.toHaveBeenCalled();
      expect(mockPatchScriptStatus).not.toHaveBeenCalled();
    });

    it("approve 状态机非法跳转（如 draft → published）→ 400", async () => {
      mockPatchScriptStatus.mockRejectedValueOnce(
        new ScriptStateTransitionError("draft", "published")
      );

      const res = await POST(makeRequest({ action: "approve" }), makeContext());
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe(1001);
    });

    it("approve patchScriptStatus 返回 null（不存在）→ 404", async () => {
      mockPatchScriptStatus.mockResolvedValueOnce(null);

      const res = await POST(makeRequest({ action: "approve" }), makeContext());
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.code).toBe(1002);
    });

    it("approve 带 edits 但 updateScript 返回 null（不存在）→ 404", async () => {
      mockUpdateScript.mockResolvedValueOnce(null);

      const res = await POST(
        makeRequest({
          action: "approve",
          edits: { title: "新标题" },
        }),
        makeContext()
      );

      expect(res.status).toBe(404);
      expect(mockPatchScriptStatus).not.toHaveBeenCalled();
    });
  });

  describe("reject", () => {
    it("reject 成功 → 状态机 pending_review → rejected", async () => {
      mockPatchScriptStatus.mockResolvedValueOnce({
        ...baseScript,
        status: "rejected",
      });

      const res = await POST(
        makeRequest({
          action: "reject",
          rejectReason: "话术与产品定位偏差",
        }),
        makeContext()
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.status).toBe("rejected");

      expect(mockPatchScriptStatus).toHaveBeenCalledTimes(1);
      expect(mockPatchScriptStatus).toHaveBeenCalledWith(
        "tenant-1",
        SCRIPT_ID,
        "rejected"
      );
    });

    it("reject 缺 rejectReason → 400", async () => {
      const res = await POST(
        makeRequest({ action: "reject" }),
        makeContext()
      );
      expect(res.status).toBe(400);
      expect(mockPatchScriptStatus).not.toHaveBeenCalled();
    });

    it("reject rejectReason 空字符串 → 400", async () => {
      const res = await POST(
        makeRequest({ action: "reject", rejectReason: "" }),
        makeContext()
      );
      expect(res.status).toBe(400);
      expect(mockPatchScriptStatus).not.toHaveBeenCalled();
    });

    it("reject 状态机非法跳转 → 400", async () => {
      mockPatchScriptStatus.mockRejectedValueOnce(
        new ScriptStateTransitionError("published", "rejected")
      );

      const res = await POST(
        makeRequest({
          action: "reject",
          rejectReason: "理由",
        }),
        makeContext()
      );
      expect(res.status).toBe(400);
    });

    it("reject 不存在 → 404", async () => {
      mockPatchScriptStatus.mockResolvedValueOnce(null);

      const res = await POST(
        makeRequest({ action: "reject", rejectReason: "理由" }),
        makeContext()
      );
      expect(res.status).toBe(404);
    });

    // unit45 补缺：跨租户隔离——主管租户与话术租户不一致时，service 视为"不存在"返回 null → 404
    // 路由层不可能 hardcode "tenant-2"；service 内 WHERE tenantId=session.user.tenantId 已过滤，
    // 这里通过 mockResolvedValueOnce(null) 模拟"跨租户/软删"统一语义。
    it("跨租户访问：service 返回 null（视为不存在） → 404 NOT_FOUND", async () => {
      mockPatchScriptStatus.mockResolvedValueOnce(null);

      const res = await POST(
        makeRequest({ action: "approve" }),
        makeContext()
      );
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      // service 仅传入主管自己的 tenantId，绝不接受请求中的 tenantId 字段
      const [tenantId, id, to] = mockPatchScriptStatus.mock.calls[0];
      expect(tenantId).toBe("tenant-1");
      expect(id).toBe(SCRIPT_ID);
      expect(to).toBe("published");
    });
  });

  describe("校验失败 / 鉴权", () => {
    it("非法 JSON → 400", async () => {
      const res = await POST(makeRequest("{not-json"), makeContext());
      expect(res.status).toBe(400);
    });

    it("缺 action → 400", async () => {
      const res = await POST(makeRequest({}), makeContext());
      expect(res.status).toBe(400);
      expect(mockPatchScriptStatus).not.toHaveBeenCalled();
    });

    it("非法 action（unknown_action） → 400", async () => {
      const res = await POST(
        makeRequest({ action: "delete" }),
        makeContext()
      );
      expect(res.status).toBe(400);
    });

    it("缺 id → 400", async () => {
      const res = await POST(makeRequest({ action: "approve" }), {
        params: Promise.resolve({}),
      });
      expect(res.status).toBe(400);
    });

    it("非 UUID id → 400", async () => {
      const res = await POST(makeRequest({ action: "approve" }), {
        params: Promise.resolve({ id: "not-a-uuid" }),
      });
      expect(res.status).toBe(400);
    });

    it("员工调用 → 403 FORBIDDEN", async () => {
      currentUser = mockEmployee;

      const res = await POST(
        makeRequest({ action: "approve" }),
        makeContext()
      );
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.code).toBe(2002);
      expect(mockPatchScriptStatus).not.toHaveBeenCalled();
    });

    it("DB 异常（非业务错） → 500", async () => {
      mockPatchScriptStatus.mockRejectedValueOnce(
        new Error("DB connection lost")
      );

      const res = await POST(makeRequest({ action: "approve" }), makeContext());
      expect(res.status).toBe(500);
    });
  });
});

describe("/api/admin/scripts/[id]/review 401 黑盒契约", () => {
  it("未登录 → 401", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/guard", async () => {
      const { errorResponse, ErrorCode } = await import("@/lib/api-response");
      return {
        withAuth: () => async () => {
          return errorResponse("未登录，请先登录", ErrorCode.UNAUTHORIZED);
        },
      };
    });
    vi.doMock("@/lib/services/scripts/repository", () => ({
      updateScript: vi.fn(),
      patchScriptStatus: vi.fn(),
    }));
    vi.doMock("@/lib/services/scripts/state-machine", () => ({
      ScriptStateTransitionError,
    }));

    const { POST: POST_real } = await import(
      "@/app/api/admin/scripts/[id]/review/route"
    );

    const res = await POST_real(
      new Request(
        `http://localhost/api/admin/scripts/${SCRIPT_ID}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        }
      ) as unknown as NextRequest,
      { params: Promise.resolve({ id: SCRIPT_ID }) }
    );
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe(2001);
  });
});
