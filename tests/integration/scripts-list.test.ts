import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：GET /api/scripts（unit15）
 *
 * 覆盖：
 *  - 员工视角：默认仅 published；带 mineUserId OR 自己的草稿
 *  - 主管视角：尊重 query.status（含 draft / pending_review / archived）
 *  - 过滤：q / status / source / sceneTagIds / productTagIds
 *  - 分页：page / pageSize 边界
 *  - status=draft 边界（员工/主管语义不同）
 *  - 鉴权失败 → withAuth 提供 401
 *  - DB 异常 → 500 DATABASE_ERROR
 *
 * Mock 策略：service 层 listScripts 直接 mock 返回值，路由层只做 zod + 角色裁剪
 */

const {
  mockEmployee,
  mockManager,
  mockListScripts,
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
  const mockListScripts = vi.fn();
  return { mockEmployee, mockManager, mockListScripts };
});

let currentUser = mockEmployee;

vi.mock("@/lib/services/scripts/repository", () => ({
  listScripts: mockListScripts,
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

import { GET } from "@/app/api/scripts/route";

function makeRequest(params?: Record<string, string | string[]>): NextRequest {
  const url = new URL("http://localhost/api/scripts");
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        v.forEach((iv) => url.searchParams.append(k, iv));
      } else {
        url.searchParams.set(k, v);
      }
    });
  }
  return new Request(url.toString()) as unknown as NextRequest;
}

const sampleScript = {
  id: "00000000-0000-4000-8000-000000000001",
  tenantId: "tenant-1",
  title: "标题1",
  customerQuestion: "问题1",
  answer: "答案1",
  source: "curated",
  status: "published",
  createdBy: "user-emp-1",
  usageCount: 0,
  deletedAt: null,
  questionAliases: [],
  knowledgeId: null,
  reviewedBy: null,
  reviewedAt: null,
  rejectReason: null,
  submissionRequestId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /api/scripts (unit15 集成)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockEmployee;
    mockListScripts.mockResolvedValue({
      items: [sampleScript],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  describe("员工视角", () => {
    it("默认请求 → status 默认锁定 published，附 mineUserId", async () => {
      const req = makeRequest();
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockListScripts).toHaveBeenCalledTimes(1);
      const [tenantId, filters, pagination] = mockListScripts.mock.calls[0];
      expect(tenantId).toBe("tenant-1");
      expect(filters.status).toBe("published");
      expect(filters.mineUserId).toBe("user-emp-1");
      expect(pagination).toEqual({ page: 1, pageSize: 20 });
    });

    it("员工传 status=draft 边界 → service 收到 status=draft + mineUserId（OR self 语义）", async () => {
      const req = makeRequest({ status: "draft" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const [, filters] = mockListScripts.mock.calls[0];
      expect(filters.status).toBe("draft");
      expect(filters.mineUserId).toBe("user-emp-1");
    });

    it("员工请求传分页 page=2&pageSize=5", async () => {
      const req = makeRequest({ page: "2", pageSize: "5" });
      mockListScripts.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 2,
        pageSize: 5,
      });
      const res = await GET(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.meta.page).toBe(2);
      expect(json.meta.limit).toBe(5);
      const [, , pagination] = mockListScripts.mock.calls[0];
      expect(pagination).toEqual({ page: 2, pageSize: 5 });
    });

    it("员工带 q + scene/product 标签 → filters 透传", async () => {
      const req = makeRequest({
        q: "镀膜",
        sceneTagIds: ["00000000-0000-4000-8000-0000000000aa"],
        productTagIds: [
          "00000000-0000-4000-8000-0000000000bb",
          "00000000-0000-4000-8000-0000000000cc",
        ],
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const [, filters] = mockListScripts.mock.calls[0];
      expect(filters.q).toBe("镀膜");
      expect(filters.sceneTagIds).toEqual([
        "00000000-0000-4000-8000-0000000000aa",
      ]);
      expect(filters.productTagIds).toHaveLength(2);
    });

    it("员工带 source=ai_submitted → 透传到 service", async () => {
      const req = makeRequest({ source: "ai_submitted" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const [, filters] = mockListScripts.mock.calls[0];
      expect(filters.source).toBe("ai_submitted");
    });
  });

  describe("主管视角", () => {
    beforeEach(() => {
      currentUser = mockManager;
    });

    it("主管默认 → 不附 status，不附 mineUserId（可读全部）", async () => {
      const req = makeRequest();
      const res = await GET(req);
      expect(res.status).toBe(200);
      const [, filters] = mockListScripts.mock.calls[0];
      expect(filters.status).toBeUndefined();
      expect(filters.mineUserId).toBeUndefined();
    });

    it("主管 status=draft → 仅按 status 过滤，不附 mineUserId", async () => {
      const req = makeRequest({ status: "draft" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const [, filters] = mockListScripts.mock.calls[0];
      expect(filters.status).toBe("draft");
      expect(filters.mineUserId).toBeUndefined();
    });

    it("主管 status=archived → 透传", async () => {
      const req = makeRequest({ status: "archived" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const [, filters] = mockListScripts.mock.calls[0];
      expect(filters.status).toBe("archived");
    });
  });

  describe("校验/异常", () => {
    it("非法 status 值 → 400 VALIDATION_ERROR", async () => {
      const req = makeRequest({ status: "invalid-status" });
      const res = await GET(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.code).toBe(1001);
    });

    it("非法 sceneTagIds（非 UUID）→ 400 VALIDATION_ERROR", async () => {
      const req = makeRequest({ sceneTagIds: "not-a-uuid" });
      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe(1001);
    });

    it("pageSize 超 100 → 400 VALIDATION_ERROR", async () => {
      const req = makeRequest({ pageSize: "999" });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it("数据库异常 → 500 DATABASE_ERROR", async () => {
      mockListScripts.mockRejectedValueOnce(new Error("connection lost"));
      const req = makeRequest();
      const res = await GET(req);
      const json = await res.json();
      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.code).toBe(4004);
    });

    it("空结果 → 200 + meta.total=0", async () => {
      mockListScripts.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });
      const req = makeRequest();
      const res = await GET(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data).toEqual([]);
      expect(json.meta.total).toBe(0);
    });
  });

  /**
   * 黑盒鉴权用例（fix Batch 6 MEDIUM）：模拟 withAuth 在无 session 时返回 401 + UNAUTHORIZED。
   *
   * 测试目标：路由层在 withAuth 拒绝（无 session）时，整体响应符合 401 + code=2001 契约。
   * 实现：用 doMock 把 withAuth 替换为「直接返回 401 errorResponse」的实现，
   * resetModules 后重新 import 路由，验证响应。
   * 不走真实 next-auth + db 链路（避免触发 lib/auth/options 中的 DATABASE_URL 校验）。
   */
  describe("未登录黑盒（401 契约）", () => {
    it("withAuth 拒绝（无 session）→ 401 UNAUTHORIZED + code=2001", async () => {
      vi.resetModules();
      // 模拟真实 withAuth 在无 session 时的行为：返回 401 errorResponse
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

      const { GET: GET_real } = await import("@/app/api/scripts/route");
      const req = new Request(
        "http://localhost/api/scripts"
      ) as unknown as NextRequest;
      const res = await GET_real(req);
      const json = await res.json();
      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.code).toBe(2001); // UNAUTHORIZED
    });
  });
});
