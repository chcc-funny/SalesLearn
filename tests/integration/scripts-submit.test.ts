import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：POST /api/scripts/submit（unit43）
 *
 * 用途：员工把 AI 生成的草稿"提交审核"，state=draft → pending_review。
 *
 * 覆盖：
 *  - 成功：createScript 入库 → patchScriptStatus(...,'pending_review') → 200 + 返回话术
 *  - createScript 收到 source='ai_submitted' + status='draft'（首次入库）
 *  - status 切换走状态机（draft → pending_review）
 *  - 校验失败：缺 requestId / 标题超长 → 400
 *  - rate limit 触发 → 429
 *  - 未登录 → 401（黑盒契约）
 *
 * Mock 策略：
 *  - lib/services/scripts/repository 整模块 mock
 *  - lib/auth/guard mock 注入 currentUser
 *  - lib/rate-limit mock checkRateLimit
 */

const {
  mockEmployee,
  mockCreateScript,
  mockPatchScriptStatus,
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
    mockCreateScript: vi.fn(),
    mockPatchScriptStatus: vi.fn(),
    mockCheckRateLimit: vi.fn(),
    ScriptStateTransitionError,
  };
});

let currentUser: typeof mockEmployee = mockEmployee;

vi.mock("@/lib/services/scripts/repository", () => ({
  createScript: mockCreateScript,
  patchScriptStatus: mockPatchScriptStatus,
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
  withAuth: vi.fn((handler: Handler) => {
    return async (
      req: NextRequest,
      ctx?: { params?: Promise<Record<string, string>> }
    ) => {
      const params = ctx?.params ? await ctx.params : undefined;
      return handler(req, { user: currentUser, params });
    };
  }),
}));

import { POST } from "@/app/api/scripts/submit/route";

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const SCRIPT_ID = "44444444-4444-4444-8444-444444444444";
const SCENE_TAG_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_TAG_ID = "22222222-2222-4222-8222-222222222222";

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/scripts/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validBody = {
  requestId: REQUEST_ID,
  title: "AI 生成 - 贴膜推荐",
  customerQuestion: "贴膜什么牌子好",
  answer: "推荐量子膜（AI 生成）",
  sceneTagIds: [SCENE_TAG_ID],
  productTagIds: [PRODUCT_TAG_ID],
};

const createdScript = {
  id: SCRIPT_ID,
  tenantId: "tenant-1",
  title: validBody.title,
  customerQuestion: validBody.customerQuestion,
  answer: validBody.answer,
  questionAliases: [],
  source: "ai_submitted",
  knowledgeId: null,
  status: "draft",
  usageCount: 0,
  createdBy: "user-emp-1",
  reviewedBy: null,
  reviewedAt: null,
  rejectReason: null,
  submissionRequestId: REQUEST_ID,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  tagIds: [SCENE_TAG_ID, PRODUCT_TAG_ID],
};

const pendingScript = { ...createdScript, status: "pending_review" };

describe("POST /api/scripts/submit (unit43)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockEmployee;
    mockCheckRateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  });

  describe("成功路径", () => {
    it("员工提交 AI 草稿 → 200 + status='pending_review'", async () => {
      mockCreateScript.mockResolvedValueOnce(createdScript);
      mockPatchScriptStatus.mockResolvedValueOnce(pendingScript);

      const res = await POST(makeRequest(validBody), {});
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("pending_review");
      expect(json.data.id).toBe(SCRIPT_ID);

      // createScript 收到 source='ai_submitted' + status='draft'（首次入库）
      expect(mockCreateScript).toHaveBeenCalledTimes(1);
      const [tenantId, createdBy, input] = mockCreateScript.mock.calls[0];
      expect(tenantId).toBe("tenant-1");
      expect(createdBy).toBe("user-emp-1");
      expect(input.source).toBe("ai_submitted");
      expect(input.status).toBe("draft");
      expect(input.title).toBe(validBody.title);
      expect(input.sceneTagIds).toEqual([SCENE_TAG_ID]);
      expect(input.productTagIds).toEqual([PRODUCT_TAG_ID]);

      // 立即调用状态机切换 draft → pending_review
      expect(mockPatchScriptStatus).toHaveBeenCalledTimes(1);
      expect(mockPatchScriptStatus).toHaveBeenCalledWith(
        "tenant-1",
        SCRIPT_ID,
        "pending_review"
      );
    });

    it("跨租户安全：service 层 tenantId 始终来自 session.user", async () => {
      mockCreateScript.mockResolvedValueOnce(createdScript);
      mockPatchScriptStatus.mockResolvedValueOnce(pendingScript);

      // body 中即使带 tenantId 字段也会被忽略（zod 不识别）
      const bodyWithEvilTenant = {
        ...validBody,
        tenantId: "tenant-evil",
      };

      await POST(makeRequest(bodyWithEvilTenant), {});

      const [tenantId] = mockCreateScript.mock.calls[0];
      expect(tenantId).toBe("tenant-1");
    });

    it("requestId 透传到 service（用于幂等）", async () => {
      mockCreateScript.mockResolvedValueOnce(createdScript);
      mockPatchScriptStatus.mockResolvedValueOnce(pendingScript);

      await POST(makeRequest(validBody), {});

      const [, , input] = mockCreateScript.mock.calls[0];
      // service.createScript 当前未识别 submissionRequestId 字段，路由层应将 requestId 透传到下层
      // v1：通过 service.createScript 的 input 携带（schema 已含 submissionRequestId UNIQUE）
      // 至少不能被静默丢弃（具体落地形式由实现决定，断言路由把 requestId 透传给 service）
      expect(input.submissionRequestId ?? input.requestId).toBe(REQUEST_ID);
    });

    // unit45 补缺：幂等串联——同一 requestId 两次提交，路由层都应把 requestId 透传给 service
    // v1 service 未持久化 submissionRequestId（schema UNIQUE 落地待 Phase 2 收尾）；
    // 这里只锁定路由层契约：任意两次调用 createScript 时，input 中携带的 requestId 与请求体一致。
    it("同一 requestId 二次提交：路由层一致透传（service / DB 层未来兜底幂等）", async () => {
      mockCreateScript.mockResolvedValueOnce(createdScript);
      mockPatchScriptStatus.mockResolvedValueOnce(pendingScript);
      mockCreateScript.mockResolvedValueOnce(createdScript);
      mockPatchScriptStatus.mockResolvedValueOnce(pendingScript);

      const r1 = await POST(makeRequest(validBody), {});
      const r2 = await POST(makeRequest(validBody), {});

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(mockCreateScript).toHaveBeenCalledTimes(2);

      const [, , input1] = mockCreateScript.mock.calls[0];
      const [, , input2] = mockCreateScript.mock.calls[1];
      const id1 = input1.submissionRequestId ?? input1.requestId;
      const id2 = input2.submissionRequestId ?? input2.requestId;
      expect(id1).toBe(REQUEST_ID);
      expect(id2).toBe(REQUEST_ID);
      // 确保字段未被静默丢弃；两次值一致 → DB UNIQUE 才能在 Phase 2 收尾时兜底重复
      expect(id1).toBe(id2);
    });
  });

  describe("校验失败", () => {
    it("非法 JSON → 400", async () => {
      const res = await POST(makeRequest("{not-json"), {});
      expect(res.status).toBe(400);
      expect(mockCreateScript).not.toHaveBeenCalled();
    });

    it("缺 requestId → 400", async () => {
      const { requestId, ...rest } = validBody;
      void requestId;
      const res = await POST(makeRequest(rest), {});
      expect(res.status).toBe(400);
      expect(mockCreateScript).not.toHaveBeenCalled();
    });

    it("requestId 非 UUID → 400", async () => {
      const res = await POST(
        makeRequest({ ...validBody, requestId: "not-a-uuid" }),
        {}
      );
      expect(res.status).toBe(400);
      expect(mockCreateScript).not.toHaveBeenCalled();
    });

    it("title 超长 → 400", async () => {
      const longTitle = "贴".repeat(300);
      const res = await POST(
        makeRequest({ ...validBody, title: longTitle }),
        {}
      );
      expect(res.status).toBe(400);
      expect(mockCreateScript).not.toHaveBeenCalled();
    });

    it("缺 answer → 400", async () => {
      const { answer, ...rest } = validBody;
      void answer;
      const res = await POST(makeRequest(rest), {});
      expect(res.status).toBe(400);
      expect(mockCreateScript).not.toHaveBeenCalled();
    });
  });

  describe("rate limit", () => {
    it("checkRateLimit 拒绝 → 429", async () => {
      mockCheckRateLimit.mockReturnValueOnce({ allowed: false, retryAfter: 12 });

      const res = await POST(makeRequest(validBody), {});
      const json = await res.json();

      expect(res.status).toBe(429);
      expect(json.code).toBe(5001);
      expect(json.error).toContain("12");
      expect(mockCreateScript).not.toHaveBeenCalled();
    });

    it("rate limit key 按 user 隔离 + 类型 = llm", async () => {
      mockCreateScript.mockResolvedValueOnce(createdScript);
      mockPatchScriptStatus.mockResolvedValueOnce(pendingScript);

      await POST(makeRequest(validBody), {});

      const [key, type] = mockCheckRateLimit.mock.calls[0];
      expect(key).toContain("user-emp-1");
      expect(type).toBe("llm");
    });
  });

  describe("DB / 状态机错误", () => {
    it("createScript 抛错（DB） → 500", async () => {
      mockCreateScript.mockRejectedValueOnce(new Error("DB connection lost"));

      const res = await POST(makeRequest(validBody), {});
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.code).toBe(4004);
      expect(mockPatchScriptStatus).not.toHaveBeenCalled();
    });

    it("patchScriptStatus 状态机非法跳转 → 400", async () => {
      mockCreateScript.mockResolvedValueOnce(createdScript);
      mockPatchScriptStatus.mockRejectedValueOnce(
        new ScriptStateTransitionError("draft", "pending_review")
      );

      const res = await POST(makeRequest(validBody), {});
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe(1001);
    });

    it("patchScriptStatus 返回 null → 500（数据被并发删除等异常）", async () => {
      mockCreateScript.mockResolvedValueOnce(createdScript);
      mockPatchScriptStatus.mockResolvedValueOnce(null);

      const res = await POST(makeRequest(validBody), {});
      expect(res.status).toBe(500);
    });
  });
});

describe("/api/scripts/submit 401 黑盒契约", () => {
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
      createScript: vi.fn(),
      patchScriptStatus: vi.fn(),
    }));
    vi.doMock("@/lib/services/scripts/state-machine", () => ({
      ScriptStateTransitionError,
    }));
    vi.doMock("@/lib/rate-limit", () => ({
      checkRateLimit: vi.fn(),
      getRateLimitType: vi.fn(() => "llm"),
    }));

    const { POST: POST_real } = await import(
      "@/app/api/scripts/submit/route"
    );

    const res = await POST_real(
      new Request("http://localhost/api/scripts/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }) as unknown as NextRequest,
      {}
    );
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe(2001);
  });
});
