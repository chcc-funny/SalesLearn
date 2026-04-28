import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockUser,
  mockSelect,
  mockFrom,
  mockWhere,
  mockLeftJoin,
  mockOrderBy,
  mockLimit,
  wireChain,
} = vi.hoisted(() => {
  const mockUser = {
    id: "user-0001",
    name: "员工用户",
    email: "employee@example.com",
    role: "employee",
    tenantId: "tenant-0001",
  };

  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockLeftJoin = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();

  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ leftJoin: mockLeftJoin });
    mockLeftJoin.mockReturnValue({ leftJoin: mockLeftJoin, where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  }

  wireChain();

  return {
    mockUser,
    mockSelect,
    mockFrom,
    mockWhere,
    mockLeftJoin,
    mockOrderBy,
    mockLimit,
    wireChain,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function) => {
    return async (req: NextRequest) => {
      return handler(req, { user: mockUser });
    };
  }),
}));

import { GET } from "@/app/api/review/list/route";

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/review/list");
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new Request(url.toString()) as unknown as NextRequest;
}

function makeErrorBookItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "eb-001",
    questionId: "q-001",
    knowledgeId: "k-001",
    knowledgeTitle: "汽车镀晶知识",
    questionText: "镀晶的主要作用?",
    options: { A: "保护漆面", B: "美化外观", C: "防腐蚀", D: "以上都是" },
    correctAnswer: "A",
    explanations: { A: "正确" },
    questionType: "memory",
    nextReviewAt: new Date(Date.now() - 3600000), // 1h ago = due
    reviewCount: 2,
    correctStreak: 0,
    isResolved: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("GET /api/review/list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("默认返回待复习（pending）错题列表", async () => {
    const items = [makeErrorBookItem(), makeErrorBookItem({ id: "eb-002" })];
    mockLimit.mockResolvedValueOnce(items);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.total).toBe(2);
    expect(Array.isArray(json.data.items)).toBe(true);
  });

  it("tab=pending 返回 dueCount 统计到期数量", async () => {
    const now = Date.now();
    const items = [
      makeErrorBookItem({ nextReviewAt: new Date(now - 1000) }), // due
      makeErrorBookItem({ id: "eb-002", nextReviewAt: new Date(now + 86400000) }), // not due yet
    ];
    mockLimit.mockResolvedValueOnce(items);

    const req = makeRequest({ tab: "pending" });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.dueCount).toBe(1);
  });

  it("tab=resolved 返回已掌握错题，dueCount 为 0", async () => {
    const items = [makeErrorBookItem({ isResolved: true })];
    mockLimit.mockResolvedValueOnce(items);

    const req = makeRequest({ tab: "resolved" });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.dueCount).toBe(0);
    expect(json.data.total).toBe(1);
  });

  it("数据库异常返回 DATABASE_ERROR", async () => {
    mockLimit.mockRejectedValueOnce(new Error("DB timeout"));

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toContain("获取错题本失败");
  });
});
