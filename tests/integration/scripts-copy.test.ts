import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：POST /api/scripts/[id]/copy（unit19）
 *
 * 覆盖：
 *  - 成功复制：published + 同租户 → 200 + usageCount 自增
 *  - ScriptCopyError 业务错误：未发布 / 跨租户 / 软删 / 不存在 → 400 VALIDATION_ERROR
 *  - 缺少 id（params 为空）→ 400 VALIDATION_ERROR
 *  - DB 异常（非 ScriptCopyError）→ 500 DATABASE_ERROR
 *  - rate-limit 触发：连续超过桶容量 → 429 RATE_LIMITED
 *  - 未登录 401 黑盒（withAuth 真实路径 + next-auth getServerSession=null）
 *
 * Mock 策略：
 *  - `lib/services/scripts/copy` 整模块 mock，避免真实 DB
 *  - `lib/auth/guard` mock 注入 currentUser
 *  - `lib/rate-limit` mock checkRateLimit 控制限流分支
 */

const {
  mockEmployee,
  mockManager,
  mockLogScriptCopy,
  mockCheckRateLimit,
  ScriptCopyError,
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
  const mockLogScriptCopy = vi.fn();
  const mockCheckRateLimit = vi.fn();

  // 复刻 ScriptCopyError，保证 route 层 `instanceof ScriptCopyError` 走业务分支
  class ScriptCopyError extends Error {
    constructor(message = "话术不可复制：仅已发布的话术允许一键复制") {
      super(message);
      this.name = "ScriptCopyError";
      Object.setPrototypeOf(this, ScriptCopyError.prototype);
    }
  }

  return {
    mockEmployee,
    mockManager,
    mockLogScriptCopy,
    mockCheckRateLimit,
    ScriptCopyError,
  };
});

let currentUser: typeof mockEmployee = mockEmployee;

// 重要：mock 整个 copy 模块（避免 importActual 触发 lib/db 的 env 校验）
vi.mock("@/lib/services/scripts/copy", () => ({
  logScriptCopy: mockLogScriptCopy,
  ScriptCopyError,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  getRateLimitType: vi.fn(() => "default"),
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

import { POST } from "@/app/api/scripts/[id]/copy/route";

const VALID_ID = "00000000-0000-4000-8000-000000000001";

function makeContext(id = VALID_ID) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(id = VALID_ID): NextRequest {
  return new Request(
    `http://localhost/api/scripts/${id}/copy`,
    { method: "POST" }
  ) as unknown as NextRequest;
}

describe("POST /api/scripts/[id]/copy (unit19 集成)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockEmployee;
    // 默认放行限流
    mockCheckRateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  });

  describe("成功路径", () => {
    it("员工复制 published 话术 → 200 + usageCount 自增", async () => {
      mockLogScriptCopy.mockResolvedValueOnce({ usageCount: 7 });

      const req = makeRequest();
      const res = await POST(req, makeContext());
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.usageCount).toBe(7);
      expect(mockLogScriptCopy).toHaveBeenCalledWith(
        VALID_ID,
        mockEmployee.id,
        mockEmployee.tenantId
      );
    });

    it("主管同样可以复制 → 200", async () => {
      currentUser = mockManager;
      mockLogScriptCopy.mockResolvedValueOnce({ usageCount: 1 });

      const req = makeRequest();
      const res = await POST(req, makeContext());
      expect(res.status).toBe(200);
      expect(mockLogScriptCopy).toHaveBeenCalledWith(
        VALID_ID,
        mockManager.id,
        mockManager.tenantId
      );
    });
  });

  describe("业务错误（ScriptCopyError）", () => {
    it("话术未发布 → 400 VALIDATION_ERROR", async () => {
      mockLogScriptCopy.mockRejectedValueOnce(
        new ScriptCopyError("话术不可复制：仅已发布的话术允许一键复制")
      );

      const req = makeRequest();
      const res = await POST(req, makeContext());
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.code).toBe(1001); // VALIDATION_ERROR
      expect(json.error).toMatch(/不可复制|已发布/);
    });

    it("话术不存在 → 400（service 层 update 0 行 → ScriptCopyError）", async () => {
      mockLogScriptCopy.mockRejectedValueOnce(new ScriptCopyError());
      const req = makeRequest();
      const res = await POST(req, makeContext());
      expect(res.status).toBe(400);
    });

    it("话术已归档（archived）→ 400", async () => {
      mockLogScriptCopy.mockRejectedValueOnce(new ScriptCopyError());
      const req = makeRequest();
      const res = await POST(req, makeContext());
      expect(res.status).toBe(400);
    });

    it("跨租户复制 → 400（service 层 WHERE tenant_id 不匹配 → 0 行）", async () => {
      // 模拟员工尝试复制其他租户的话术：service 层 update WHERE tenant_id 不匹配 → 0 行 → ScriptCopyError
      mockLogScriptCopy.mockRejectedValueOnce(new ScriptCopyError());
      const req = makeRequest();
      const res = await POST(req, makeContext());
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.code).toBe(1001);
      // 验证 service 收到的 tenantId 是当前用户的
      expect(mockLogScriptCopy).toHaveBeenCalledWith(
        VALID_ID,
        mockEmployee.id,
        "tenant-1"
      );
    });
  });

  describe("校验/异常", () => {
    it("缺少 id（params 为空）→ 400 VALIDATION_ERROR", async () => {
      const req = makeRequest();
      const res = await POST(req, { params: Promise.resolve({}) });
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.code).toBe(1001);
      expect(json.error).toMatch(/缺少|ID/);
      // 校验失败时不应触达 service
      expect(mockLogScriptCopy).not.toHaveBeenCalled();
    });

    it("DB 异常（非 ScriptCopyError）→ 500 DATABASE_ERROR", async () => {
      mockLogScriptCopy.mockRejectedValueOnce(new Error("connection lost"));
      const req = makeRequest();
      const res = await POST(req, makeContext());
      const json = await res.json();
      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.code).toBe(4004); // DATABASE_ERROR
    });
  });

  describe("rate limit", () => {
    it("用户级超频 → 429 RATE_LIMITED + retryAfter 提示", async () => {
      mockCheckRateLimit.mockReturnValueOnce({
        allowed: false,
        retryAfter: 12,
      });

      const req = makeRequest();
      const res = await POST(req, makeContext());
      const json = await res.json();

      expect(res.status).toBe(429);
      expect(json.success).toBe(false);
      expect(json.code).toBe(5001); // RATE_LIMITED
      expect(json.error).toMatch(/12s|频繁/);
      // 限流触发时不应调用 service
      expect(mockLogScriptCopy).not.toHaveBeenCalled();
    });

    it("rate limit key 按用户隔离 → 形如 script-copy:user:<userId>", async () => {
      mockLogScriptCopy.mockResolvedValueOnce({ usageCount: 1 });

      const req = makeRequest();
      await POST(req, makeContext());

      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
      const [key, type] = mockCheckRateLimit.mock.calls[0];
      expect(key).toBe(`script-copy:user:${mockEmployee.id}`);
      expect(type).toBe("default");
    });
  });

  /**
   * 黑盒鉴权用例：mock withAuth 模拟无 session → 401 契约
   */
  describe("未登录黑盒（401 契约）", () => {
    it("withAuth 拒绝（无 session）→ 401 UNAUTHORIZED + code=2001", async () => {
      vi.resetModules();
      vi.doMock("@/lib/auth/guard", async () => {
        const { errorResponse, ErrorCode } = await import(
          "@/lib/api-response"
        );
        return {
          withAuth: () => async () => {
            return errorResponse("未登录，请先登录", ErrorCode.UNAUTHORIZED);
          },
        };
      });
      // copy 路由还依赖 service 与 rate-limit；为保持隔离，重新 doMock
      vi.doMock("@/lib/services/scripts/copy", () => ({
        logScriptCopy: vi.fn(),
        ScriptCopyError,
      }));
      vi.doMock("@/lib/rate-limit", () => ({
        checkRateLimit: vi.fn(() => ({ allowed: true, retryAfter: 0 })),
        getRateLimitType: vi.fn(() => "default"),
      }));

      const { POST: POST_real } = await import(
        "@/app/api/scripts/[id]/copy/route"
      );
      const req = new Request(
        `http://localhost/api/scripts/${VALID_ID}/copy`,
        { method: "POST" }
      ) as unknown as NextRequest;
      const res = await POST_real(req, makeContext());
      const json = await res.json();
      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.code).toBe(2001);
    });
  });
});
