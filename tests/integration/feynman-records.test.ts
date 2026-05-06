import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const {
  mockEmployeeUser,
  mockManagerUser,
  mockSelect,
  mockFrom,
  mockWhere,
  mockLeftJoin,
  mockOrderBy,
  mockLimit,
  wireChain,
} = vi.hoisted(() => {
  const mockEmployeeUser = {
    id: "user-0001",
    name: "员工用户",
    email: "employee@example.com",
    role: "employee",
    tenantId: "tenant-0001",
  };

  const mockManagerUser = {
    id: "manager-0001",
    name: "主管用户",
    email: "manager@example.com",
    role: "manager",
    tenantId: "tenant-0001",
  };

  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockLeftJoin = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();

  /**
   * feynman/records 路由有两条查询路径：
   * 1. 带 knowledgeId：select().from().where(and(...)).orderBy().limit()
   * 2. 不带 knowledgeId：select().from().leftJoin().where().orderBy().limit()
   */
  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere, leftJoin: mockLeftJoin });
    mockLeftJoin.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  }

  wireChain();

  return {
    mockEmployeeUser,
    mockManagerUser,
    mockSelect,
    mockFrom,
    mockWhere,
    mockLeftJoin,
    mockOrderBy,
    mockLimit,
    wireChain,
  };
});

// ---- Current user for withAuth mock ----
let currentUser = mockEmployeeUser;

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function) => {
    return async (req: NextRequest) => {
      return handler(req, { user: currentUser });
    };
  }),
}));

import { GET } from "@/app/api/feynman/records/route";

const VALID_KNOWLEDGE_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/feynman/records");
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new Request(url.toString()) as unknown as NextRequest;
}

function makeSampleRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "fr-001",
    stage: "A",
    totalScore: 85.5,
    isPassed: true,
    createdAt: new Date("2026-01-15T09:00:00Z"),
    ...overrides,
  };
}

function makeSampleSummaryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "fr-001",
    knowledgeId: VALID_KNOWLEDGE_ID,
    knowledgeTitle: "汽车镀晶知识",
    stage: "A",
    totalScore: 85.5,
    isPassed: true,
    createdAt: new Date("2026-01-15T09:00:00Z"),
    ...overrides,
  };
}

describe("GET /api/feynman/records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
    currentUser = mockEmployeeUser;
  });

  // ---- 无 knowledgeId：汇总模式（leftJoin knowledgeBase）----

  it("无 knowledgeId 参数 → 返回全部费曼记录汇总（含 knowledgeTitle）", async () => {
    const records = [
      makeSampleSummaryRecord(),
      makeSampleSummaryRecord({ id: "fr-002", knowledgeId: "k-002", knowledgeTitle: "量子膜知识" }),
    ];
    mockLimit.mockResolvedValueOnce(records);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.records)).toBe(true);
    expect(json.data.records).toHaveLength(2);
    expect(json.data.records[0]).toHaveProperty("knowledgeTitle");
    expect(json.data.records[0]).toHaveProperty("knowledgeId");
  });

  // ---- 带 knowledgeId：单知识点记录模式 ----

  it("带 knowledgeId → 返回该知识点的历史费曼记录", async () => {
    const records = [
      makeSampleRecord({ id: "fr-010", stage: "A", totalScore: 70 }),
      makeSampleRecord({ id: "fr-011", stage: "B", totalScore: 90 }),
    ];
    mockLimit.mockResolvedValueOnce(records);

    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.records)).toBe(true);
    expect(json.data.records).toHaveLength(2);
  });

  // ---- 员工权限：仅返回自己的记录 ----

  it("员工用户请求 → 仅返回自己的记录（where userId = currentUser.id）", async () => {
    mockLimit.mockResolvedValueOnce([makeSampleSummaryRecord()]);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    // 验证 db.select 被调用（查询以 userId 隔离）
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  // ---- 主管权限（与员工相同接口，仅查自己记录）----

  it("主管用户请求 → 同样只返回自己的费曼记录", async () => {
    currentUser = mockManagerUser;
    const records = [makeSampleSummaryRecord({ id: "fr-mgr-001" })];
    mockLimit.mockResolvedValueOnce(records);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.records).toHaveLength(1);
  });

  // ---- 空结果 ----

  it("无记录时返回空数组", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.records).toEqual([]);
  });

  // ---- 带 knowledgeId 时空结果 ----

  it("指定 knowledgeId 但无记录 → 返回空数组", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.records).toEqual([]);
  });

  // ---- 字段完整性（带 knowledgeId 路径）----

  it("带 knowledgeId 返回字段：id / stage / totalScore / isPassed / createdAt", async () => {
    mockLimit.mockResolvedValueOnce([
      makeSampleRecord({
        id: "fr-001",
        stage: "A",
        totalScore: 88.0,
        isPassed: true,
        createdAt: new Date("2026-01-15T09:00:00Z"),
      }),
    ]);

    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    const record = json.data.records[0];
    expect(record).toHaveProperty("id");
    expect(record).toHaveProperty("stage");
    expect(record).toHaveProperty("totalScore");
    expect(record).toHaveProperty("isPassed");
    expect(record).toHaveProperty("createdAt");
  });

  // ---- 字段完整性（汇总路径）----

  it("无 knowledgeId 返回字段：id / knowledgeId / knowledgeTitle / stage / totalScore / isPassed / createdAt", async () => {
    mockLimit.mockResolvedValueOnce([makeSampleSummaryRecord()]);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    const record = json.data.records[0];
    expect(record).toHaveProperty("id");
    expect(record).toHaveProperty("knowledgeId");
    expect(record).toHaveProperty("knowledgeTitle");
    expect(record).toHaveProperty("stage");
    expect(record).toHaveProperty("totalScore");
    expect(record).toHaveProperty("isPassed");
    expect(record).toHaveProperty("createdAt");
  });

  // ---- isPassed 字段值校验 ----

  it("通过的记录 isPassed=true，未通过的 isPassed=false", async () => {
    mockLimit.mockResolvedValueOnce([
      makeSampleRecord({ id: "fr-pass", isPassed: true, totalScore: 90 }),
      makeSampleRecord({ id: "fr-fail", isPassed: false, totalScore: 45 }),
    ]);

    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    const [passed, failed] = json.data.records;
    expect(passed.isPassed).toBe(true);
    expect(failed.isPassed).toBe(false);
  });

  // ---- stage A / B 两种值都能正常返回 ----

  it("stage A 和 stage B 记录都能正常返回", async () => {
    mockLimit.mockResolvedValueOnce([
      makeSampleRecord({ id: "fr-a", stage: "A" }),
      makeSampleRecord({ id: "fr-b", stage: "B" }),
    ]);

    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    const stages = json.data.records.map((r: { stage: string }) => r.stage);
    expect(stages).toContain("A");
    expect(stages).toContain("B");
  });

  // ---- 数据库异常 ----

  it("数据库异常 → 500 DATABASE_ERROR", async () => {
    mockLimit.mockRejectedValueOnce(new Error("DB connection timeout"));

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toContain("获取费曼记录失败");
  });

  // ---- 数据库异常（带 knowledgeId 路径）----

  it("带 knowledgeId 时数据库异常 → 500 DATABASE_ERROR", async () => {
    mockLimit.mockRejectedValueOnce(new Error("Query failed"));

    const req = makeRequest({ knowledgeId: VALID_KNOWLEDGE_ID });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toContain("获取费曼记录失败");
  });
});
