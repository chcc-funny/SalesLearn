import { vi, beforeEach, describe, it, expect } from "vitest";

// ============================================================
// Mock 所有外部依赖（必须在 import authOptions 前）
// ============================================================

vi.mock("@/lib/db", () => {
  const limitFn = vi.fn().mockResolvedValue([]);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return {
    db: { select: selectFn },
    __limitFn: limitFn,
  };
});

vi.mock("@/lib/db/schema", () => ({
  users: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => val),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("bcryptjs", () => ({
  compare: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: { NEXTAUTH_SECRET: "test-secret" },
}));

import { authOptions } from "@/lib/auth/options";
import * as bcrypt from "bcryptjs";

const mockCompare = vi.mocked(bcrypt.compare);

// 获取内部 limit mock（通过模块副作用注入）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDb = async () => (await import("@/lib/db")) as any;

/** 获取 CredentialsProvider 的原始 authorize 函数 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const provider = authOptions.providers[0] as any;
const authorize: (creds: { email?: string; password?: string } | undefined) => Promise<unknown> =
  provider.options.authorize.bind(provider);

describe("authOptions 配置", () => {
  describe("基础配置", () => {
    it("session 策略为 jwt，maxAge 为 7 天", () => {
      expect(authOptions.session?.strategy).toBe("jwt");
      expect(authOptions.session?.maxAge).toBe(7 * 24 * 60 * 60);
    });

    it("登录页面配置为 /login", () => {
      expect(authOptions.pages?.signIn).toBe("/login");
    });

    it("secret 已配置", () => {
      expect(authOptions.secret).toBe("test-secret");
    });
  });

  describe("authorize 函数", () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      const mod = await getDb();
      // 重置 limit 的默认返回为空数组
      mod.__limitFn.mockResolvedValue([]);
    });

    it("credentials 为 undefined 时抛出错误", async () => {
      await expect(authorize(undefined)).rejects.toThrow("请输入邮箱和密码");
    });

    it("email 为空时抛出错误", async () => {
      await expect(authorize({ email: "", password: "pass" })).rejects.toThrow("请输入邮箱和密码");
    });

    it("password 为空时抛出错误", async () => {
      await expect(authorize({ email: "a@test.com", password: "" })).rejects.toThrow("请输入邮箱和密码");
    });

    it("用户不存在时抛出错误", async () => {
      const mod = await getDb();
      mod.__limitFn.mockResolvedValue([]);

      await expect(
        authorize({ email: "notfound@test.com", password: "pass" })
      ).rejects.toThrow("账号不存在或已被禁用");
    });

    it("密码错误时抛出错误", async () => {
      const mod = await getDb();
      mod.__limitFn.mockResolvedValue([
        { id: "u1", name: "Alice", email: "a@test.com", role: "employee", tenantId: "t1", passwordHash: "hashed" },
      ]);
      mockCompare.mockResolvedValue(false as never);

      await expect(
        authorize({ email: "a@test.com", password: "wrongpass" })
      ).rejects.toThrow("密码错误");
    });

    it("邮箱和密码正确时返回用户信息", async () => {
      const mockUser = {
        id: "u1",
        name: "Alice",
        email: "a@test.com",
        role: "employee",
        tenantId: "t1",
        passwordHash: "hashed",
      };
      const mod = await getDb();
      mod.__limitFn.mockResolvedValue([mockUser]);
      mockCompare.mockResolvedValue(true as never);

      const result = await authorize({ email: "a@test.com", password: "correctpass" });

      expect(result).toEqual({
        id: "u1",
        name: "Alice",
        email: "a@test.com",
        role: "employee",
        tenantId: "t1",
      });
    });

    it("数据库查询异常时抛出友好错误信息", async () => {
      const mod = await getDb();
      mod.__limitFn.mockRejectedValue(new Error("DB connection failed"));

      await expect(
        authorize({ email: "a@test.com", password: "pass" })
      ).rejects.toThrow("登录服务暂时不可用，请稍后重试");
    });
  });

  describe("callbacks", () => {
    it("jwt callback：首次登录时将 user 信息合并到 token", async () => {
      const token = { sub: "u1" };
      const user = { id: "u1", role: "employee", tenantId: "t1" } as never;

      const result = await (authOptions.callbacks as NonNullable<typeof authOptions.callbacks>).jwt!({
        token,
        user,
        account: null,
        trigger: "signIn",
      });

      expect(result).toMatchObject({ id: "u1", role: "employee", tenantId: "t1" });
    });

    it("jwt callback：刷新时不覆盖 user（user 为 undefined），原样返回 token", async () => {
      const token = { sub: "u1", id: "u1", role: "manager", tenantId: "t2" };

      const result = await (authOptions.callbacks as NonNullable<typeof authOptions.callbacks>).jwt!({
        token,
        user: undefined as never,
        account: null,
        trigger: "update",
      });

      expect(result).toEqual(token);
    });

    it("session callback：将 token 信息注入 session.user", async () => {
      const session = { user: { name: "Alice", email: "a@test.com" }, expires: "2099-01-01" };
      const token = { id: "u1", role: "employee", tenantId: "t1" } as never;

      const result = await (authOptions.callbacks as NonNullable<typeof authOptions.callbacks>).session!({
        session,
        token,
        user: undefined as never,
        newSession: undefined,
        trigger: "update",
      });

      expect(result.user).toMatchObject({ id: "u1", role: "employee", tenantId: "t1" });
    });
  });
});
