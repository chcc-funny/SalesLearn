import { vi, beforeEach, describe, it, expect } from "vitest";

// Mock next-auth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

// Mock auth options（避免实际依赖 db/env）
vi.mock("@/lib/auth/options", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth";
import { getSession, getCurrentUser } from "@/lib/auth/session";

const mockGetServerSession = vi.mocked(getServerSession);

describe("auth/session 工具函数", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSession", () => {
    it("调用 getServerSession 并返回 session 对象", async () => {
      const mockSession = { user: { id: "u1", role: "employee", tenantId: "t1" } };
      mockGetServerSession.mockResolvedValue(mockSession as never);

      const result = await getSession();

      expect(mockGetServerSession).toHaveBeenCalledOnce();
      expect(result).toEqual(mockSession);
    });

    it("无 session 时返回 null", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const result = await getSession();

      expect(result).toBeNull();
    });
  });

  describe("getCurrentUser", () => {
    it("有 session 时返回 user 对象", async () => {
      const mockUser = { id: "u1", name: "Alice", role: "employee", tenantId: "t1" };
      mockGetServerSession.mockResolvedValue({ user: mockUser } as never);

      const user = await getCurrentUser();

      expect(user).toEqual(mockUser);
    });

    it("session 为 null 时返回 null", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const user = await getCurrentUser();

      expect(user).toBeNull();
    });

    it("session.user 为 undefined 时返回 null", async () => {
      mockGetServerSession.mockResolvedValue({ user: undefined } as never);

      const user = await getCurrentUser();

      expect(user).toBeNull();
    });
  });
});
