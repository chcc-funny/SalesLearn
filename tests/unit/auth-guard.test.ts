import { vi, beforeEach, describe, it, expect } from "vitest";
import { withAuth } from "@/lib/auth/guard";
import { ErrorCode } from "@/lib/api-response";
import type { NextRequest } from "next/server";

// Mock next-auth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

// Mock auth options（避免触发 db/env 等依赖）
vi.mock("@/lib/auth/options", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth";

const mockGetServerSession = vi.mocked(getServerSession);

/** 创建最小化的 NextRequest mock */
function makeRequest(): NextRequest {
  return {} as NextRequest;
}

/** 解析 Response 为 JSON */
async function parseJson(res: Response) {
  return res.json();
}

describe("withAuth 鉴权守卫", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("未登录场景", () => {
    it("session 为 null 时返回 401 未登录错误", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const handler = vi.fn();
      const wrapped = withAuth(handler);

      const res = await wrapped(makeRequest());

      expect(res!.status).toBe(401);
      const body = await parseJson(res!);
      expect(body.success).toBe(false);
      expect(body.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(handler).not.toHaveBeenCalled();
    });

    it("session.user 为 undefined 时返回 401 未登录错误", async () => {
      mockGetServerSession.mockResolvedValue({ user: undefined } as never);

      const handler = vi.fn();
      const wrapped = withAuth(handler);

      const res = await wrapped(makeRequest());

      expect(res!.status).toBe(401);
      const body = await parseJson(res!);
      expect(body.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("已登录但权限不足", () => {
    it("角色不在 allowedRoles 列表时返回 403 禁止访问", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "u1", role: "employee", tenantId: "t1" },
      } as never);

      const handler = vi.fn();
      const wrapped = withAuth(handler, ["manager"]);

      const res = await wrapped(makeRequest());

      expect(res!.status).toBe(403);
      const body = await parseJson(res!);
      expect(body.success).toBe(false);
      expect(body.code).toBe(ErrorCode.FORBIDDEN);
      expect(handler).not.toHaveBeenCalled();
    });

    it("allowedRoles 包含多个角色时，不匹配的角色仍返回 403", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "u2", role: "employee", tenantId: "t1" },
      } as never);

      const handler = vi.fn();
      // 假设有 admin 角色
      const wrapped = withAuth(handler, ["manager" as never]);

      const res = await wrapped(makeRequest());

      expect(res!.status).toBe(403);
    });
  });

  describe("已登录且有权限", () => {
    it("无 allowedRoles 限制时，任意登录用户都可访问", async () => {
      const mockUser = { id: "u1", role: "employee", tenantId: "t1", name: "Alice", email: "a@test.com" };
      mockGetServerSession.mockResolvedValue({ user: mockUser } as never);

      const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
      const wrapped = withAuth(handler);

      const req = makeRequest();
      const res = await wrapped(req);

      expect(res!.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(req, { user: mockUser, params: undefined });
    });

    it("角色在 allowedRoles 列表内时调用 handler", async () => {
      const mockUser = { id: "u2", role: "manager", tenantId: "t2" };
      mockGetServerSession.mockResolvedValue({ user: mockUser } as never);

      const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
      const wrapped = withAuth(handler, ["manager"]);

      await wrapped(makeRequest());

      expect(handler).toHaveBeenCalledOnce();
    });

    it("allowedRoles 为空数组时，任意登录用户都可访问", async () => {
      const mockUser = { id: "u3", role: "employee", tenantId: "t3" };
      mockGetServerSession.mockResolvedValue({ user: mockUser } as never);

      const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
      const wrapped = withAuth(handler, []);

      await wrapped(makeRequest());

      expect(handler).toHaveBeenCalledOnce();
    });

    it("将 await 后的 params 传递给 handler", async () => {
      const mockUser = { id: "u4", role: "employee", tenantId: "t4" };
      mockGetServerSession.mockResolvedValue({ user: mockUser } as never);

      const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
      const wrapped = withAuth(handler);

      const req = makeRequest();
      const resolvedParams = { id: "card-123" };
      const context = { params: Promise.resolve(resolvedParams) };

      await wrapped(req, context);

      expect(handler).toHaveBeenCalledWith(req, { user: mockUser, params: resolvedParams });
    });

    it("context 为 undefined 时 params 为 undefined", async () => {
      const mockUser = { id: "u5", role: "employee", tenantId: "t5" };
      mockGetServerSession.mockResolvedValue({ user: mockUser } as never);

      const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
      const wrapped = withAuth(handler);

      await wrapped(makeRequest(), undefined);

      expect(handler).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ params: undefined })
      );
    });
  });
});
