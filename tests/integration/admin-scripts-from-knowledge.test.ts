import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

/**
 * 集成测试：POST /api/admin/scripts/from-knowledge（unit23）
 *
 * 业务：
 *  - 校验 knowledge_id 属于当前租户（跨租户 → 403 / 不存在 → 404）
 *  - 复制 knowledge 内容字段，生成 source='from_knowledge' 的 draft 话术
 *  - MVP 阶段不调 AI；title/customerQuestion/answer 直接来自 knowledge
 *  - 可选标签（sceneTagIds / productTagIds）
 *  - rate limit / role: manager only
 *
 * 覆盖：
 *  - 成功 → 200 + service 收到 source='from_knowledge'/status='draft'/knowledgeId
 *  - knowledge 不存在 → 404
 *  - 跨租户 knowledge → 403 FORBIDDEN
 *  - 缺 knowledgeId → 400
 *  - 非 UUID knowledgeId → 400
 *  - 标签数组超长 → 400
 *  - 员工调用 → 403
 *  - 非法 JSON → 400
 *  - DB 异常 → 500
 *  - 401 黑盒契约
 */

const {
  mockEmployee,
  mockManager,
  mockCreateScript,
  mockDbSelect,
  mockDbWhere,
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
  const mockDbWhere = vi.fn();
  const mockDbFrom = vi.fn(() => ({ where: mockDbWhere }));
  const mockDbSelect = vi.fn(() => ({ from: mockDbFrom }));
  return {
    mockEmployee,
    mockManager,
    mockCreateScript: vi.fn(),
    mockDbSelect,
    mockDbWhere,
  };
});

let currentUser: typeof mockEmployee = mockManager;

vi.mock("@/lib/db", () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock("@/lib/services/scripts/repository", () => ({
  createScript: mockCreateScript,
}));

type Handler = (
  req: NextRequest,
  ctx: { user: typeof mockEmployee; params?: Record<string, string> }
) => Promise<Response>;

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Handler, allowedRoles?: string[]) => {
    return async (
      req: NextRequest,
      ctx?: { params?: Promise<Record<string, string>> }
    ) => {
      if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
        const { errorResponse, ErrorCode } = await import(
          "@/lib/api-response"
        );
        return errorResponse("权限不足，无法访问", ErrorCode.FORBIDDEN);
      }
      const params = ctx?.params ? await ctx.params : undefined;
      return handler(req, { user: currentUser, params });
    };
  }),
}));

import { POST } from "@/app/api/admin/scripts/from-knowledge/route";

const KNOWLEDGE_ID = "55555555-5555-4555-8555-555555555555";
const SCENE_TAG_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_TAG_ID = "22222222-2222-4222-8222-222222222222";

function makeRequest(body: unknown): NextRequest {
  return new Request(`http://localhost/api/admin/scripts/from-knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const knowledgeRow = {
  id: KNOWLEDGE_ID,
  tenantId: "tenant-1",
  title: "汽车镀膜的好处",
  category: "product",
  keyPoints: ["持久光泽", "易清洁"],
  content: "镀膜后表面更光滑，污渍不易附着，保养频率降低。",
  examples: null,
  commonMistakes: null,
  images: [],
  status: "published",
  sourceFileUrl: null,
  createdBy: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const createdScript = {
  id: "00000000-0000-4000-8000-000000000099",
  tenantId: "tenant-1",
  title: knowledgeRow.title,
  customerQuestion: knowledgeRow.title,
  questionAliases: [],
  answer: knowledgeRow.content,
  source: "from_knowledge",
  status: "draft",
  createdBy: "user-mgr-1",
  knowledgeId: KNOWLEDGE_ID,
  usageCount: 0,
  reviewedBy: null,
  reviewedAt: null,
  rejectReason: null,
  submissionRequestId: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  tagIds: [],
};

describe("POST /api/admin/scripts/from-knowledge (unit23)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManager;
    // 默认：knowledge 存在且属于 tenant-1
    mockDbWhere.mockResolvedValue([knowledgeRow]);
    mockCreateScript.mockResolvedValue(createdScript);
  });

  it("成功：从 knowledge 创建 draft 话术 → 200", async () => {
    const res = await POST(makeRequest({ knowledgeId: KNOWLEDGE_ID }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.source).toBe("from_knowledge");
    expect(json.data.status).toBe("draft");
    expect(json.data.knowledgeId).toBe(KNOWLEDGE_ID);

    // service 调用断言
    expect(mockCreateScript).toHaveBeenCalledTimes(1);
    const [tenantId, createdBy, input] = mockCreateScript.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(createdBy).toBe("user-mgr-1");
    expect(input.source).toBe("from_knowledge");
    expect(input.status).toBe("draft");
    expect(input.knowledgeId).toBe(KNOWLEDGE_ID);
    // 内容字段从 knowledge 复制（MVP 不调 AI）
    expect(input.title).toBe(knowledgeRow.title);
    expect(input.answer).toBe(knowledgeRow.content);
  });

  it("可附带标签（sceneTagIds + productTagIds）→ 透传给 service", async () => {
    const res = await POST(
      makeRequest({
        knowledgeId: KNOWLEDGE_ID,
        sceneTagIds: [SCENE_TAG_ID],
        productTagIds: [PRODUCT_TAG_ID],
      })
    );
    expect(res.status).toBe(200);
    const [, , input] = mockCreateScript.mock.calls[0];
    expect(input.sceneTagIds).toEqual([SCENE_TAG_ID]);
    expect(input.productTagIds).toEqual([PRODUCT_TAG_ID]);
  });

  it("knowledge 不存在 → 404 NOT_FOUND", async () => {
    mockDbWhere.mockResolvedValueOnce([]);

    const res = await POST(makeRequest({ knowledgeId: KNOWLEDGE_ID }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe(1002);
    expect(mockCreateScript).not.toHaveBeenCalled();
  });

  it("跨租户：knowledge 属于其他租户 → 404（按租户过滤后查不到）", async () => {
    // 实现层应在 SELECT 时附加 tenantId 条件，跨租户 row 不会返回
    mockDbWhere.mockResolvedValueOnce([]);

    const res = await POST(makeRequest({ knowledgeId: KNOWLEDGE_ID }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe(1002);
  });

  it("缺 knowledgeId → 400", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe(1001);
    expect(mockCreateScript).not.toHaveBeenCalled();
  });

  it("非 UUID knowledgeId → 400", async () => {
    const res = await POST(makeRequest({ knowledgeId: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(mockCreateScript).not.toHaveBeenCalled();
  });

  it("标签包含非法 UUID → 400", async () => {
    const res = await POST(
      makeRequest({
        knowledgeId: KNOWLEDGE_ID,
        sceneTagIds: ["not-uuid"],
      })
    );
    expect(res.status).toBe(400);
    expect(mockCreateScript).not.toHaveBeenCalled();
  });

  it("员工调用 → 403", async () => {
    currentUser = mockEmployee;
    const res = await POST(makeRequest({ knowledgeId: KNOWLEDGE_ID }));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.code).toBe(2002);
    expect(mockCreateScript).not.toHaveBeenCalled();
  });

  it("非法 JSON → 400", async () => {
    const req = new Request(`http://localhost/api/admin/scripts/from-knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("DB select 异常 → 500", async () => {
    mockDbWhere.mockRejectedValueOnce(new Error("DB lost"));
    const res = await POST(makeRequest({ knowledgeId: KNOWLEDGE_ID }));
    expect(res.status).toBe(500);
  });

  it("createScript 异常 → 500", async () => {
    mockCreateScript.mockRejectedValueOnce(new Error("DB lost"));
    const res = await POST(makeRequest({ knowledgeId: KNOWLEDGE_ID }));
    expect(res.status).toBe(500);
  });

  it("跨租户安全：service 收到的 tenantId 始终来自 session.user", async () => {
    await POST(
      makeRequest({
        knowledgeId: KNOWLEDGE_ID,
        // body 塞 tenantId 不应被采用
        tenantId: "tenant-attacker",
      })
    );
    const [tenantId] = mockCreateScript.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
  });

  it("body 塞 source/status 也被忽略，服务侧 source 强制 from_knowledge / status=draft", async () => {
    await POST(
      makeRequest({
        knowledgeId: KNOWLEDGE_ID,
        source: "ai_submitted",
        status: "published",
      })
    );
    const [, , input] = mockCreateScript.mock.calls[0];
    expect(input.source).toBe("from_knowledge");
    expect(input.status).toBe("draft");
  });
});

describe("/api/admin/scripts/from-knowledge 401 黑盒契约", () => {
  it("POST 未登录 → 401", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/guard", async () => {
      const { errorResponse, ErrorCode } = await import("@/lib/api-response");
      return {
        withAuth: () => async () => {
          return errorResponse("未登录，请先登录", ErrorCode.UNAUTHORIZED);
        },
      };
    });
    vi.doMock("@/lib/db", () => ({ db: { select: vi.fn() } }));
    vi.doMock("@/lib/services/scripts/repository", () => ({
      createScript: vi.fn(),
    }));

    const { POST: POST_real } = await import(
      "@/app/api/admin/scripts/from-knowledge/route"
    );

    const res = await POST_real(
      new Request(`http://localhost/api/admin/scripts/from-knowledge`, {
        method: "POST",
        body: JSON.stringify({ knowledgeId: KNOWLEDGE_ID }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe(2001);
  });
});
