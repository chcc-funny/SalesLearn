import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockManagerUser,
  mockEmployeeUser,
  mockUpdate,
  mockDelete,
  mockSet,
  mockWhere,
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
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();

  function wireChain() {
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
    mockDelete.mockReturnValue({ where: mockWhere });
  }

  wireChain();

  return {
    mockManagerUser,
    mockEmployeeUser,
    mockUpdate,
    mockDelete,
    mockSet,
    mockWhere,
    mockReturning,
    wireChain,
  };
});

let currentUser = mockManagerUser;

vi.mock("@/lib/db", () => ({
  db: {
    update: mockUpdate,
    delete: mockDelete,
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function, allowedRoles?: string[]) => {
    return async (req: NextRequest) => {
      if (allowedRoles && allowedRoles.length > 0) {
        if (!allowedRoles.includes(currentUser.role)) {
          const { errorResponse, ErrorCode } = await import("@/lib/api-response");
          return errorResponse("权限不足，无法访问", ErrorCode.FORBIDDEN);
        }
      }
      return handler(req, { user: currentUser });
    };
  }),
}));

import { PATCH } from "@/app/api/knowledge/batch/route";

const VALID_UUID_1 = "b8e6df91-431b-4365-8fca-8cec901bcd87";
const VALID_UUID_2 = "30bc8273-b5c6-44fe-bf0f-3b9823d9c92c";
const VALID_UUID_3 = "60e53924-51d9-4e35-8326-18379655fc45";

function makePatchRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/knowledge/batch", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

describe("PATCH /api/knowledge/batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockManagerUser;
  });

  // ── 权限测试 ────────────────────────────────────────────────────────────────

  it("员工调用返回 403 FORBIDDEN", async () => {
    currentUser = mockEmployeeUser;

    const req = makePatchRequest({ action: "publish", ids: [VALID_UUID_1] });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  // ── publish action ──────────────────────────────────────────────────────────

  it("manager publish 3 条 → 200，affected=3，update 包含 reviewedBy/reviewedAt", async () => {
    const returnedIds = [
      { id: VALID_UUID_1 },
      { id: VALID_UUID_2 },
      { id: VALID_UUID_3 },
    ];
    mockReturning.mockResolvedValueOnce(returnedIds);

    const req = makePatchRequest({
      action: "publish",
      ids: [VALID_UUID_1, VALID_UUID_2, VALID_UUID_3],
    });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.affected).toBe(3);

    // 验证 set 调用包含 reviewedBy 和 reviewedAt
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "published",
        reviewedBy: mockManagerUser.id,
        reviewedAt: expect.any(Date),
      })
    );
  });

  it("publish 跨租户 ids（mock affected=0）→ 200, affected=0", async () => {
    mockReturning.mockResolvedValueOnce([]);

    const req = makePatchRequest({
      action: "publish",
      ids: [VALID_UUID_1],
    });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.affected).toBe(0);
  });

  // ── delete action ───────────────────────────────────────────────────────────

  it("manager delete 成功 → 200，affected=N", async () => {
    const returnedIds = [{ id: VALID_UUID_1 }, { id: VALID_UUID_2 }];
    // delete 调用 db.delete().where().returning()
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce(returnedIds);

    const req = makePatchRequest({
      action: "delete",
      ids: [VALID_UUID_1, VALID_UUID_2],
    });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.affected).toBe(2);
  });

  it("manager delete 触发 FK 23503 → 返回友好错误", async () => {
    const fkError = Object.assign(new Error("foreign key violation"), {
      code: "23503",
    });
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockRejectedValueOnce(fkError);

    const req = makePatchRequest({
      action: "delete",
      ids: [VALID_UUID_1],
    });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("引用");
  });

  // ── setCategory action ──────────────────────────────────────────────────────

  it("manager setCategory 成功 → 200，affected=N", async () => {
    const returnedIds = [{ id: VALID_UUID_1 }];
    mockReturning.mockResolvedValueOnce(returnedIds);

    const req = makePatchRequest({
      action: "setCategory",
      ids: [VALID_UUID_1],
      category: "product",
    });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.affected).toBe(1);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ category: "product" })
    );
  });

  // ── 校验错误 ────────────────────────────────────────────────────────────────

  it("ids 为空 → 400 VALIDATION_ERROR", async () => {
    const req = makePatchRequest({ action: "publish", ids: [] });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("缺少 action → 400 VALIDATION_ERROR", async () => {
    const req = makePatchRequest({ ids: [VALID_UUID_1] });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("setCategory 缺少 category → 400 VALIDATION_ERROR", async () => {
    const req = makePatchRequest({
      action: "setCategory",
      ids: [VALID_UUID_1],
    });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("ids 超过 100 → 400 VALIDATION_ERROR", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => {
      const hex = i.toString(16).padStart(8, "0");
      return `${hex}-e5f6-4a7b-8c9d-0e1f2a3b4c5d`;
    });
    const req = makePatchRequest({ action: "publish", ids });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("请求体格式错误 → 400 VALIDATION_ERROR", async () => {
    const req = new Request("http://localhost/api/knowledge/batch", {
      method: "PATCH",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    }) as unknown as NextRequest;

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  // ── 数据库异常 ──────────────────────────────────────────────────────────────

  it("数据库异常（非 FK）→ 500 DATABASE_ERROR", async () => {
    mockReturning.mockRejectedValueOnce(new Error("connection timeout"));

    const req = makePatchRequest({
      action: "publish",
      ids: [VALID_UUID_1],
    });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe(4004);
  });
});
