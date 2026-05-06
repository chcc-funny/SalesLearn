import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockUser,
  mockSelect,
  mockInsert,
  mockUpdate,
  mockFrom,
  mockWhere,
  mockLimit,
  mockInnerJoin,
  mockValues,
  mockReturning,
  mockSet,
  wireChain,
} = vi.hoisted(() => {
  const mockUser = {
    id: "user-0001",
    name: "员工用户",
    email: "employee@example.com",
    role: "employee",
    tenantId: "tenant-0001",
  };

  const mockReturning = vi.fn();
  const mockSet = vi.fn();
  const mockValues = vi.fn();
  const mockLimit = vi.fn();
  const mockInnerJoin = vi.fn();
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();

  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin });
    mockInnerJoin.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, returning: mockReturning });
  }

  wireChain();

  return {
    mockUser,
    mockSelect,
    mockInsert,
    mockUpdate,
    mockFrom,
    mockWhere,
    mockLimit,
    mockInnerJoin,
    mockValues,
    mockReturning,
    mockSet,
    wireChain,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function) => {
    return async (req: NextRequest) => {
      return handler(req, { user: mockUser });
    };
  }),
}));

import { GET, POST } from "@/app/api/learning/progress/route";

const VALID_KNOWLEDGE_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/learning/progress");
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new Request(url.toString()) as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/learning/progress", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

describe("GET /api/learning/progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("返回学习进度统计数据", async () => {
    // first select: knowledgeBase count
    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockResolvedValueOnce([{ count: 10 }]);

    // second select: progress completed/inProgress
    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere, innerJoin: mockInnerJoin });
    mockInnerJoin.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockResolvedValueOnce([{ completed: 3, inProgress: 2 }]);

    const req = makeGetRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.total).toBe(10);
    expect(json.data.completed).toBe(3);
    expect(json.data.inProgress).toBe(2);
    expect(json.data.notStarted).toBe(5);
    expect(json.data.percentage).toBe(30);
  });

  it("支持 category 过滤参数", async () => {
    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockResolvedValueOnce([{ count: 5 }]);

    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere, innerJoin: mockInnerJoin });
    mockInnerJoin.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockResolvedValueOnce([{ completed: 5, inProgress: 0 }]);

    const req = makeGetRequest({ category: "product" });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.percentage).toBe(100);
  });
});

describe("POST /api/learning/progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("缺少必填字段 knowledgeId 返回 VALIDATION_ERROR", async () => {
    const req = makePostRequest({ viewDuration: 10 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("新建进度记录成功返回创建结果", async () => {
    // select existing: empty
    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([]);

    // insert
    const created = {
      id: "progress-1",
      userId: mockUser.id,
      knowledgeId: VALID_KNOWLEDGE_ID,
      viewDuration: 15,
      scrollDepth: 0.5,
      isCompleted: false,
    };
    mockInsert.mockReturnValueOnce({ values: mockValues });
    mockValues.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([created]);

    const req = makePostRequest({
      knowledgeId: VALID_KNOWLEDGE_ID,
      viewDuration: 15,
      scrollDepth: 0.5,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.viewDuration).toBe(15);
    expect(json.data.isCompleted).toBe(false);
  });

  it("满足自动完成条件（duration>=30 且 scrollDepth>=0.8）自动标记 isCompleted", async () => {
    const existing = {
      id: "progress-2",
      userId: mockUser.id,
      knowledgeId: VALID_KNOWLEDGE_ID,
      viewDuration: 20,
      scrollDepth: 0.5,
      isCompleted: false,
      isFavorited: false,
      completedAt: null,
    };

    // select existing: found
    mockSelect.mockReturnValueOnce({ from: mockFrom });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([existing]);

    // update returning
    const updated = { ...existing, viewDuration: 35, scrollDepth: 0.9, isCompleted: true };
    mockUpdate.mockReturnValueOnce({ set: mockSet });
    mockSet.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([updated]);

    const req = makePostRequest({
      knowledgeId: VALID_KNOWLEDGE_ID,
      viewDuration: 15,
      scrollDepth: 0.9,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.isCompleted).toBe(true);
  });
});
