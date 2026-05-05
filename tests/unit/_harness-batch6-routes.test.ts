import { describe, it, expect, vi } from "vitest";

/**
 * Harness Batch 6 - 路由 smoke 测试
 *
 * 单元层只验证 API 路由模块可以被 import 且导出 handler 是 function。
 * 实际 HTTP 行为（鉴权 / 校验 / 响应结构）的覆盖在 Batch 6/9 集成测试中完成。
 *
 * 覆盖：
 *  - unit16: app/api/scripts/[id]/route.ts        （GET 详情）
 *  - unit17: app/api/scripts/[id]/copy/route.ts   （POST 复制 + 用户级 rate-limit）
 */

// Mock 链路依赖，避免 import 阶段触发真实 db / 鉴权 / 限流
vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: (handler: unknown) => handler,
}));

vi.mock("@/lib/services/scripts/repository", () => ({
  getScriptById: vi.fn(),
}));

vi.mock("@/lib/services/scripts/copy", () => ({
  logScriptCopy: vi.fn(),
  ScriptCopyError: class ScriptCopyError extends Error {},
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, retryAfter: 0 })),
}));

describe("Batch 6 路由 smoke - unit16: app/api/scripts/[id]/route", () => {
  it("可以 import 且导出 GET handler 是 function", async () => {
    const mod = await import("@/app/api/scripts/[id]/route");
    expect(mod).toBeDefined();
    expect(mod.GET).toBeDefined();
    expect(typeof mod.GET).toBe("function");
  });
});

describe("Batch 6 路由 smoke - unit17: app/api/scripts/[id]/copy/route", () => {
  it("可以 import 且导出 POST handler 是 function", async () => {
    const mod = await import("@/app/api/scripts/[id]/copy/route");
    expect(mod).toBeDefined();
    expect(mod.POST).toBeDefined();
    expect(typeof mod.POST).toBe("function");
  });

  it("rate-limit 函数 checkRateLimit 在依赖模块中存在", async () => {
    const rl = await import("@/lib/rate-limit");
    expect(rl).toBeDefined();
    expect(rl.checkRateLimit).toBeDefined();
    expect(typeof rl.checkRateLimit).toBe("function");
  });
});
