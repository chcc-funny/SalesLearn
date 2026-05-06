import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：POST /api/scripts/generate（unit42）
 *
 * 覆盖：
 *  - 成功命中精选（source='curated'）→ 200 + items
 *  - 未命中走兜底生成（source='generated' / 'mixed'）→ 200 + items
 *  - 编排返回 source='empty' → 200 + items=[]
 *  - 入参 zod 校验失败（缺 customerQuestion / 超过 500 字 / 非 UUID 标签）→ 400
 *  - 限流触发：checkRateLimit allowed=false → 429 RATE_LIMITED
 *  - LLM 失败兜底（orchestrator 抛错）→ 200 + source='empty' + generateError（顺手修 Batch 14 MEDIUM）
 *  - 未登录 → 401（黑盒契约）
 *
 * Mock 策略：
 *  - lib/services/scripts/orchestrator 整模块 mock，避免真实 LLM
 *  - lib/auth/guard mock 注入 currentUser
 *  - lib/rate-limit mock checkRateLimit 控制限流分支
 */

const {
  mockEmployee,
  mockManager,
  mockSearchOrGenerate,
  mockCheckRateLimit,
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
  return {
    mockEmployee,
    mockManager,
    mockSearchOrGenerate: vi.fn(),
    mockCheckRateLimit: vi.fn(),
  };
});

let currentUser: typeof mockEmployee = mockEmployee;

vi.mock("@/lib/services/scripts/orchestrator", () => ({
  searchOrGenerateScripts: mockSearchOrGenerate,
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

import { POST } from "@/app/api/scripts/generate/route";

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/scripts/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const SCENE_TAG_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_TAG_ID = "22222222-2222-4222-8222-222222222222";

describe("POST /api/scripts/generate (unit42)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockEmployee;
    mockCheckRateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  });

  describe("成功路径", () => {
    it("命中精选（curated）→ 200 + items", async () => {
      mockSearchOrGenerate.mockResolvedValueOnce({
        source: "curated",
        items: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            title: "贴膜推荐",
            customerQuestion: "贴膜什么牌子好",
            answer: "推荐量子膜",
            score: 0.95,
            rerankReason: "题面贴合",
          },
        ],
      });

      const res = await POST(
        makeRequest({ customerQuestion: "贴膜什么牌子好" }),
        {}
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.source).toBe("curated");
      expect(json.data.items).toHaveLength(1);
      expect(json.data.items[0].id).toBe(
        "00000000-0000-4000-8000-000000000001"
      );

      // 编排函数收到正确的 tenantId（来自 session.user）
      expect(mockSearchOrGenerate).toHaveBeenCalledTimes(1);
      const callArg = mockSearchOrGenerate.mock.calls[0][0];
      expect(callArg.tenantId).toBe("tenant-1");
      expect(callArg.customerQuestion).toBe("贴膜什么牌子好");
    });

    it("生成（generated）→ 200 + items", async () => {
      mockSearchOrGenerate.mockResolvedValueOnce({
        source: "generated",
        items: [
          {
            id: "generated:0",
            title: "AI 生成 - 贴膜推荐",
            customerQuestion: "贴膜什么牌子好",
            answer: "推荐量子膜（AI）",
            score: 0,
            isGenerated: true,
            sourceIds: ["k1"],
          },
        ],
      });

      const res = await POST(
        makeRequest({ customerQuestion: "贴膜什么牌子好" }),
        {}
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.source).toBe("generated");
      expect(json.data.items[0].isGenerated).toBe(true);
    });

    it("混合（mixed）→ 200 + items 含 isGenerated", async () => {
      mockSearchOrGenerate.mockResolvedValueOnce({
        source: "mixed",
        items: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            title: "候选 1",
            customerQuestion: "原问题",
            answer: "原答案",
            score: 0.6,
          },
          {
            id: "generated:0",
            title: "AI 生成",
            customerQuestion: "原问题",
            answer: "AI 答案",
            score: 0,
            isGenerated: true,
            sourceIds: [],
          },
        ],
      });

      const res = await POST(
        makeRequest({ customerQuestion: "贴膜推荐" }),
        {}
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.source).toBe("mixed");
      expect(json.data.items).toHaveLength(2);
    });

    it("空结果（empty）→ 200 + items=[]", async () => {
      mockSearchOrGenerate.mockResolvedValueOnce({
        source: "empty",
        items: [],
      });

      const res = await POST(
        makeRequest({ customerQuestion: "极其稀有的问题" }),
        {}
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.source).toBe("empty");
      expect(json.data.items).toEqual([]);
    });

    it("传 sceneTagId / productTagId → 透传给 orchestrator", async () => {
      mockSearchOrGenerate.mockResolvedValueOnce({ source: "empty", items: [] });

      await POST(
        makeRequest({
          customerQuestion: "贴膜推荐",
          sceneTagId: SCENE_TAG_ID,
          productTagId: PRODUCT_TAG_ID,
        }),
        {}
      );

      const callArg = mockSearchOrGenerate.mock.calls[0][0];
      expect(callArg.sceneTagId).toBe(SCENE_TAG_ID);
      expect(callArg.productTagId).toBe(PRODUCT_TAG_ID);
    });

    it("管理员也允许调用 → 200", async () => {
      currentUser = mockManager;
      mockSearchOrGenerate.mockResolvedValueOnce({
        source: "curated",
        items: [],
      });

      const res = await POST(
        makeRequest({ customerQuestion: "管理员测试" }),
        {}
      );
      expect(res.status).toBe(200);
    });
  });

  describe("校验失败", () => {
    it("非法 JSON → 400", async () => {
      const res = await POST(makeRequest("{not-json"), {});
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe(1001);
      expect(mockSearchOrGenerate).not.toHaveBeenCalled();
    });

    it("缺 customerQuestion → 400", async () => {
      const res = await POST(makeRequest({}), {});
      expect(res.status).toBe(400);
      expect(mockSearchOrGenerate).not.toHaveBeenCalled();
    });

    it("customerQuestion 超过 500 字 → 400", async () => {
      const longQ = "贴膜".repeat(300); // 600 chars
      const res = await POST(
        makeRequest({ customerQuestion: longQ }),
        {}
      );
      expect(res.status).toBe(400);
      expect(mockSearchOrGenerate).not.toHaveBeenCalled();
    });

    it("空字符串 customerQuestion → 400", async () => {
      const res = await POST(
        makeRequest({ customerQuestion: "" }),
        {}
      );
      expect(res.status).toBe(400);
      expect(mockSearchOrGenerate).not.toHaveBeenCalled();
    });

    it("非 UUID sceneTagId → 400", async () => {
      const res = await POST(
        makeRequest({
          customerQuestion: "贴膜推荐",
          sceneTagId: "not-a-uuid",
        }),
        {}
      );
      expect(res.status).toBe(400);
      expect(mockSearchOrGenerate).not.toHaveBeenCalled();
    });
  });

  describe("rate limit", () => {
    it("checkRateLimit 拒绝 → 429 RATE_LIMITED", async () => {
      mockCheckRateLimit.mockReturnValueOnce({ allowed: false, retryAfter: 30 });

      const res = await POST(
        makeRequest({ customerQuestion: "贴膜推荐" }),
        {}
      );
      const json = await res.json();

      expect(res.status).toBe(429);
      expect(json.code).toBe(5001);
      expect(json.error).toContain("30");
      expect(mockSearchOrGenerate).not.toHaveBeenCalled();
    });

    it("rate limit key 按 user.id 隔离 + 类型 = llm", async () => {
      mockSearchOrGenerate.mockResolvedValueOnce({ source: "empty", items: [] });

      await POST(
        makeRequest({ customerQuestion: "贴膜推荐" }),
        {}
      );

      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
      const [key, type] = mockCheckRateLimit.mock.calls[0];
      expect(key).toContain("user-emp-1");
      expect(type).toBe("llm");
    });
  });

  describe("LLM 失败降级（顺手修 Batch 14 MEDIUM）", () => {
    it("orchestrator 抛错 → 200 + source='empty' + generateError 提示", async () => {
      mockSearchOrGenerate.mockRejectedValueOnce(
        new Error("Claude Sonnet 调用超时")
      );

      const res = await POST(
        makeRequest({ customerQuestion: "贴膜推荐" }),
        {}
      );
      const json = await res.json();

      // 优雅降级：HTTP 200，前端可继续渲染空态 + 提示
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.source).toBe("empty");
      expect(json.data.items).toEqual([]);
      expect(json.data.generateError).toBeDefined();
      expect(typeof json.data.generateError).toBe("string");
    });

    it("orchestrator 抛非 Error 对象（如字符串） → 200 + source='empty'", async () => {
      mockSearchOrGenerate.mockRejectedValueOnce("rerank failed");

      const res = await POST(
        makeRequest({ customerQuestion: "贴膜推荐" }),
        {}
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.source).toBe("empty");
      expect(json.data.generateError).toBeDefined();
    });
  });
});

describe("/api/scripts/generate 401 黑盒契约", () => {
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
    vi.doMock("@/lib/services/scripts/orchestrator", () => ({
      searchOrGenerateScripts: vi.fn(),
    }));
    vi.doMock("@/lib/rate-limit", () => ({
      checkRateLimit: vi.fn(),
      getRateLimitType: vi.fn(() => "llm"),
    }));

    const { POST: POST_real } = await import(
      "@/app/api/scripts/generate/route"
    );

    const res = await POST_real(
      new Request("http://localhost/api/scripts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerQuestion: "贴膜推荐" }),
      }) as unknown as NextRequest,
      {}
    );
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe(2001);
  });
});
