import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：POST /api/admin/scripts/[id]/archive（unit22）
 *
 * 覆盖：
 *  - published → archived 成功 → 200
 *  - 不存在 / 跨租户（service 返回 null）→ 404
 *  - 状态机非法跳转（draft / pending_review / rejected / archived → archived）→ 400 + code=1001
 *  - 缺 id → 400
 *  - 角色限制：employee → 403
 *  - DB 异常 → 500 DATABASE_ERROR
 *  - 401 未登录契约黑盒
 */

const { mockEmployee, mockManager, mockArchiveScript, ScriptStateTransitionError } =
  vi.hoisted(() => {
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
    // 复刻业务异常类（hoisted 内部声明，与下方 vi.mock 共用同一引用）
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
      mockArchiveScript: vi.fn(),
      ScriptStateTransitionError,
    };
  });

let currentUser: typeof mockEmployee = mockManager;

vi.mock("@/lib/services/scripts/repository", () => ({
  archiveScript: mockArchiveScript,
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

import { POST } from "@/app/api/admin/scripts/[id]/archive/route";

const VALID_ID = "00000000-0000-4000-8000-000000000001";

function makeContext(id = VALID_ID) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(id = VALID_ID): NextRequest {
  return new Request(`http://localhost/api/admin/scripts/${id}/archive`, {
    method: "POST",
  }) as unknown as NextRequest;
}

const archivedScript = {
  id: VALID_ID,
  tenantId: "tenant-1",
  title: "已归档话术",
  customerQuestion: "问题",
  answer: "答案",
  source: "curated",
  status: "archived",
  createdBy: "user-mgr-1",
  usageCount: 0,
  questionAliases: [],
  knowledgeId: null,
  reviewedBy: null,
  reviewedAt: null,
  rejectReason: null,
  submissionRequestId: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("POST /api/admin/scripts/[id]/archive (unit22)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManager;
  });

  it("published → archived 成功 → 200 + service 收到 (tenantId, id)", async () => {
    mockArchiveScript.mockResolvedValueOnce(archivedScript);

    const res = await POST(makeRequest(), makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("archived");
    expect(json.data.id).toBe(VALID_ID);

    expect(mockArchiveScript).toHaveBeenCalledTimes(1);
    expect(mockArchiveScript).toHaveBeenCalledWith("tenant-1", VALID_ID);
  });

  it("话术不存在（service 返回 null）→ 404 NOT_FOUND", async () => {
    mockArchiveScript.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(), makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1002);
  });

  it("跨租户（service 返回 null）→ 404", async () => {
    mockArchiveScript.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it.each([
    ["draft", "archived"],
    ["pending_review", "archived"],
    ["rejected", "archived"],
    ["archived", "archived"],
  ])("非法跳转 %s → %s → 400 VALIDATION_ERROR", async (from, to) => {
    mockArchiveScript.mockRejectedValueOnce(
      new ScriptStateTransitionError(from, to)
    );

    const res = await POST(makeRequest(), makeContext());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
    // 错误信息应包含转移上下文，便于前端展示
    expect(json.error).toContain(from);
    expect(json.error).toContain(to);
  });

  it("缺 id → 400 VALIDATION_ERROR", async () => {
    const res = await POST(makeRequest(), {
      params: Promise.resolve({}),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe(1001);
    expect(mockArchiveScript).not.toHaveBeenCalled();
  });

  it("非 UUID id 也走 VALIDATION_ERROR（zod 校验 id 格式）", async () => {
    // 即使路由层不强校验，service 调用也会因 DB 类型错而失败；
    // 但本路由实现按规范应在 zod 层挡住
    const res = await POST(makeRequest("not-a-uuid"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe(1001);
    expect(mockArchiveScript).not.toHaveBeenCalled();
  });

  it("员工调用 → 403 FORBIDDEN", async () => {
    currentUser = mockEmployee;

    const res = await POST(makeRequest(), makeContext());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe(2002);
    expect(mockArchiveScript).not.toHaveBeenCalled();
  });

  it("DB 异常（非业务错误）→ 500 DATABASE_ERROR", async () => {
    mockArchiveScript.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await POST(makeRequest(), makeContext());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe(4004);
  });

  it("跨租户安全：service 收到的 tenantId 始终来自 session.user", async () => {
    mockArchiveScript.mockResolvedValueOnce(archivedScript);

    await POST(makeRequest(), makeContext());

    const [tenantId, id] = mockArchiveScript.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(id).toBe(VALID_ID);
  });
});

describe("/api/admin/scripts/[id]/archive 401 黑盒契约", () => {
  it("POST 未登录 → 401", async () => {
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
      archiveScript: vi.fn(),
    }));
    vi.doMock("@/lib/services/scripts/state-machine", () => ({
      ScriptStateTransitionError,
    }));

    const { POST: POST_real } = await import(
      "@/app/api/admin/scripts/[id]/archive/route"
    );

    const res = await POST_real(
      new Request(`http://localhost/api/admin/scripts/${VALID_ID}/archive`, {
        method: "POST",
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: VALID_ID }) }
    );
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe(2001);
  });
});
