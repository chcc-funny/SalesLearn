import { describe, it, expect, vi } from "vitest";

/**
 * Harness Batch 5 - 路由 smoke 测试
 *
 * 单元层只验证 API 路由模块可以被 import 且导出 GET handler 是 function。
 * 实际 HTTP 行为（鉴权 / 校验 / 响应结构）的覆盖在 Batch 6/9 集成测试中完成。
 *
 * 覆盖：
 *  - unit14: app/api/scripts/tags/route.ts
 *  - unit15: app/api/scripts/route.ts
 */

// Mock 链路依赖，避免 import 阶段触发真实 db / 鉴权
vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: (handler: unknown) => handler,
}));

vi.mock("@/lib/services/scripts/repository", () => ({
  listScripts: vi.fn(),
}));

vi.mock("@/lib/services/scripts/tags", () => ({
  listTags: vi.fn(),
}));

describe("Batch 5 路由 smoke - unit14: app/api/scripts/tags/route", () => {
  it("可以 import 且导出 GET handler 是 function", async () => {
    const mod = await import("@/app/api/scripts/tags/route");
    expect(mod).toBeDefined();
    expect(mod.GET).toBeDefined();
    expect(typeof mod.GET).toBe("function");
  });
});

describe("Batch 5 路由 smoke - unit15: app/api/scripts/route", () => {
  it("可以 import 且导出 GET handler 是 function", async () => {
    const mod = await import("@/app/api/scripts/route");
    expect(mod).toBeDefined();
    expect(mod.GET).toBeDefined();
    expect(typeof mod.GET).toBe("function");
  });
});
