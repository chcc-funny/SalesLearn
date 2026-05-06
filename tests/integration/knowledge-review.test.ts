import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockManagerUser,
  mockEmployeeUser,
  mockSelect,
  mockUpdate,
  mockFrom,
  mockWhere,
  mockLimit,
  mockSet,
  mockReturning,
  wireChain,
} = vi.hoisted(() => {
  const mockManagerUser = {
    id: "manager-0001",
    name: "主管用户",
    email: "manager@example.com",
    role: "manager",
    tenantId: "tenant-0001",
  };

  const mockEmployeeUser = {
    id: "user-0001",
    name: "员工用户",
    email: "employee@example.com",
    role: "employee",
    tenantId: "tenant-0001",
  };

  const mockReturning = vi.fn();
  const mockSet = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();

  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, where: mockWhere });
    mockLimit.mockResolvedValue([]);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, returning: mockReturning });
    mockReturning.mockResolvedValue([]);
  }

  wireChain();

  return {
    mockManagerUser,
    mockEmployeeUser,
    mockSelect,
    mockUpdate,
    mockFrom,
    mockWhere,
    mockLimit,
    mockSet,
    mockReturning,
    wireChain,
  };
});

let currentUser = mockManagerUser;

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function, allowedRoles?: string[]) => {
    return async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) => {
      if (allowedRoles && allowedRoles.length > 0) {
        if (!allowedRoles.includes(currentUser.role)) {
          const { errorResponse, ErrorCode } = await import("@/lib/api-response");
          return errorResponse("权限不足，无法访问", ErrorCode.FORBIDDEN);
        }
      }
      const params = ctx?.params ? await ctx.params : undefined;
      return handler(req, { user: currentUser, params });
    };
  }),
}));

import { POST } from "@/app/api/knowledge/[id]/review/route";

const VALID_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function makeRequest(body: unknown, id = VALID_ID): NextRequest {
  return new Request(`http://localhost/api/knowledge/${id}/review`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

function makeContext(id = VALID_ID) {
  return { params: Promise.resolve({ id }) };
}

const reviewingItem = {
  id: VALID_ID,
  tenantId: "tenant-0001",
  status: "reviewing",
  title: "测试知识点",
};

describe("POST /api/knowledge/[id]/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockManagerUser;
  });

  it("员工角色审核返回 403 FORBIDDEN", async () => {
    currentUser = mockEmployeeUser;

    const req = makeRequest({ action: "approve" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it("approve 操作将状态更新为 published", async () => {
    mockLimit.mockResolvedValueOnce([reviewingItem]);

    const updated = { ...reviewingItem, status: "published" };
    mockReturning.mockResolvedValueOnce([updated]);

    const req = makeRequest({ action: "approve" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("published");
  });

  it("reject 操作将状态更新为 draft", async () => {
    mockLimit.mockResolvedValueOnce([reviewingItem]);

    const updated = { ...reviewingItem, status: "draft" };
    mockReturning.mockResolvedValueOnce([updated]);

    const req = makeRequest({ action: "reject" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("draft");
  });

  it("知识点不存在返回 NOT_FOUND", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = makeRequest({ action: "approve" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("不存在");
  });

  it("知识点状态非 reviewing 返回 VALIDATION_ERROR", async () => {
    mockLimit.mockResolvedValueOnce([{ ...reviewingItem, status: "published" }]);

    const req = makeRequest({ action: "approve" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("审核中");
  });

  it("无效的 action 值返回 VALIDATION_ERROR", async () => {
    const req = makeRequest({ action: "delete" });
    const res = await POST(req, makeContext());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });
});
