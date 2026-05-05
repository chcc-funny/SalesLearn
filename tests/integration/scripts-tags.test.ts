import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：GET /api/scripts/tags（unit14）
 *
 * 覆盖：
 *  - 任意登录用户（员工/主管）均可访问
 *  - 默认 onlyActive=true（员工只看启用中标签）
 *  - 按 group 分组返回 { scene: [], product: [] }
 *  - 过滤参数：groupKey / onlyActive
 *  - 校验失败 → 400
 *  - 服务层异常 → 500 DATABASE_ERROR
 *
 * Mock 策略：listTags service 直接 mock，路由层做 zod + 分组
 */

const {
  mockEmployee,
  mockManager,
  mockListTags,
} = vi.hoisted(() => {
  const mockEmployee = {
    id: "user-emp-2",
    name: "员工",
    email: "emp2@example.com",
    role: "employee",
    tenantId: "tenant-1",
  };
  const mockManager = {
    id: "user-mgr-2",
    name: "主管",
    email: "mgr2@example.com",
    role: "manager",
    tenantId: "tenant-1",
  };
  const mockListTags = vi.fn();
  return { mockEmployee, mockManager, mockListTags };
});

let currentUser = mockEmployee;

vi.mock("@/lib/services/scripts/tags", () => ({
  listTags: mockListTags,
}));

type Handler = (
  req: NextRequest,
  ctx: { user: typeof mockEmployee; params?: Record<string, string> }
) => Promise<Response>;

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Handler) => {
    return async (req: NextRequest) => {
      return handler(req, { user: currentUser });
    };
  }),
}));

import { GET } from "@/app/api/scripts/tags/route";

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/scripts/tags");
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new Request(url.toString()) as unknown as NextRequest;
}

const sceneTag = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "tenant-1",
  groupKey: "scene",
  name: "新车交付",
  sortOrder: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const productTag = {
  id: "22222222-2222-4222-8222-222222222222",
  tenantId: "tenant-1",
  groupKey: "product",
  name: "前挡膜",
  sortOrder: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /api/scripts/tags (unit14 集成)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockEmployee;
    mockListTags.mockResolvedValue([sceneTag, productTag]);
  });

  it("员工默认请求 → 200 且按 group 分组", async () => {
    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      scene: [expect.objectContaining({ id: sceneTag.id, groupKey: "scene" })],
      product: [
        expect.objectContaining({ id: productTag.id, groupKey: "product" }),
      ],
    });
    // 默认 onlyActive=true
    const [tenantId, options] = mockListTags.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(options.onlyActive).toBe(true);
  });

  it("主管同样可访问 → 200", async () => {
    currentUser = mockManager;
    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("groupKey=scene 过滤 → service 收到 groupKey=scene", async () => {
    mockListTags.mockResolvedValueOnce([sceneTag]);
    const req = makeRequest({ groupKey: "scene" });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.scene).toHaveLength(1);
    expect(json.data.product).toHaveLength(0);
    const [, options] = mockListTags.mock.calls[0];
    expect(options.groupKey).toBe("scene");
  });

  it("onlyActive=false → service 收到 onlyActive=false", async () => {
    const req = makeRequest({ onlyActive: "false" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const [, options] = mockListTags.mock.calls[0];
    expect(options.onlyActive).toBe(false);
  });

  it("非法 groupKey → 400 VALIDATION_ERROR", async () => {
    const req = makeRequest({ groupKey: "invalid-group" });
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("非 enum 字符串布尔 onlyActive=yes → 400 VALIDATION_ERROR", async () => {
    const req = makeRequest({ onlyActive: "yes" });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("空结果 → 返回空分组", async () => {
    mockListTags.mockResolvedValueOnce([]);
    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual({ scene: [], product: [] });
  });

  it("未知 groupKey 的脏数据被防御性过滤", async () => {
    // service 返回未在 enum 中的 group（理论上 DB 字段无 enum 约束）
    const dirty = { ...sceneTag, groupKey: "unknown-key" };
    mockListTags.mockResolvedValueOnce([dirty, productTag]);
    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    // 未知 group 被忽略，product 仍然返回
    expect(json.data.scene).toHaveLength(0);
    expect(json.data.product).toHaveLength(1);
  });

  it("数据库异常 → 500 DATABASE_ERROR", async () => {
    mockListTags.mockRejectedValueOnce(new Error("DB error"));
    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe(4004);
  });

  /**
   * 黑盒鉴权用例（fix Batch 6 MEDIUM）：mock withAuth 模拟无 session → 401 契约。
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

      const { GET: GET_real } = await import(
        "@/app/api/scripts/tags/route"
      );
      const req = new Request(
        "http://localhost/api/scripts/tags"
      ) as unknown as NextRequest;
      const res = await GET_real(req);
      const json = await res.json();
      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.code).toBe(2001);
    });
  });
});
