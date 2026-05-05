import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * unit12: lib/services/scripts/repository.ts
 *
 * mock drizzle client；不连真实 DB。覆盖：
 *  - listScripts：where 拼装、分页 limit/offset、count 并行查询
 *  - getScriptById：租户隔离 + tags join
 *  - createScript：插入 + 标签关系写入（事务内）
 *  - updateScript：更新主表 + 重写关联标签
 *  - patchStatus：调用 assertTransition；非法跳转抛错
 *  - softDelete / archive：状态机硬拦截
 */

const {
  mockSelect,
  mockWhere,
  mockOrderBy,
  mockLimit,
  mockOffset,
  mockUpdate,
  mockSet,
  mockInsert,
  mockValues,
  mockReturning,
  mockDelete,
  mockTransaction,
  wireChain,
} = vi.hoisted(() => {
  const mockOffset = vi.fn();
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockInnerJoin = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockReturning = vi.fn();
  const mockValues = vi.fn();
  const mockInsert = vi.fn();
  const mockDelete = vi.fn();
  const mockTransaction = vi.fn();

  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({
      where: mockWhere,
      innerJoin: mockInnerJoin,
    });
    mockInnerJoin.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({
      orderBy: mockOrderBy,
      where: mockWhere,
      limit: mockLimit,
    });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ offset: mockOffset });
    mockOffset.mockResolvedValue([]);

    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({
      returning: mockReturning,
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    });
    mockReturning.mockResolvedValue([]);

    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });

    mockDelete.mockReturnValue({ where: mockWhere });

    // 默认事务实现：直接执行 callback，并把 mock db 传进去
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      return cb({
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
        delete: mockDelete,
      });
    });
  }

  wireChain();

  return {
    mockSelect,
    mockWhere,
    mockOrderBy,
    mockLimit,
    mockOffset,
    mockUpdate,
    mockSet,
    mockInsert,
    mockValues,
    mockReturning,
    mockDelete,
    mockTransaction,
    wireChain,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    transaction: mockTransaction,
  },
}));

import {
  listScripts,
  getScriptById,
  createScript,
  updateScript,
  patchScriptStatus,
  softDeleteScript,
  archiveScript,
} from "@/lib/services/scripts/repository";
import { ScriptStateTransitionError } from "@/lib/services/scripts/state-machine";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const SCRIPT_ID_1 = "33333333-3333-4333-8333-333333333333";
const TAG_ID_1 = "44444444-4444-4444-8444-444444444444";
const TAG_ID_2 = "55555555-5555-4555-8555-555555555555";
const KNOWLEDGE_ID = "66666666-6666-4666-8666-666666666666";
const USER_ID = "77777777-7777-4777-8777-777777777777";

describe("listScripts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("默认分页 page=1 / pageSize=20，未软删", async () => {
    const items = [
      { id: SCRIPT_ID_1, title: "话术 A", tenantId: TENANT_A, status: "published" },
    ];
    mockOffset.mockResolvedValueOnce(items);
    let whereCalls = 0;
    mockWhere.mockImplementation(() => {
      whereCalls++;
      if (whereCalls === 1) {
        return { orderBy: mockOrderBy, limit: mockLimit, where: mockWhere };
      }
      return Promise.resolve([{ count: 1 }]) as unknown as ReturnType<
        typeof mockWhere
      >;
    });

    const result = await listScripts(TENANT_A, {}, { page: 1, pageSize: 20 });

    expect(mockSelect).toHaveBeenCalled();
    expect(result.items).toEqual(items);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("filter.status 过滤拼到 where 里", async () => {
    mockOffset.mockResolvedValueOnce([]);
    let whereCalls = 0;
    mockWhere.mockImplementation(() => {
      whereCalls++;
      if (whereCalls === 1) {
        return { orderBy: mockOrderBy, limit: mockLimit, where: mockWhere };
      }
      return Promise.resolve([{ count: 0 }]) as unknown as ReturnType<
        typeof mockWhere
      >;
    });

    await listScripts(TENANT_A, { status: "published" }, { page: 1, pageSize: 10 });
    expect(mockWhere).toHaveBeenCalled();
  });

  it("filter.q 触发 trgm 模糊匹配条件", async () => {
    mockOffset.mockResolvedValueOnce([]);
    let whereCalls = 0;
    mockWhere.mockImplementation(() => {
      whereCalls++;
      if (whereCalls === 1) {
        return { orderBy: mockOrderBy, limit: mockLimit, where: mockWhere };
      }
      return Promise.resolve([{ count: 0 }]) as unknown as ReturnType<
        typeof mockWhere
      >;
    });

    await listScripts(TENANT_A, { q: "3M对比" }, { page: 1, pageSize: 10 });
    expect(mockWhere).toHaveBeenCalled();
  });

  it("page=2 计算 offset 正确", async () => {
    mockOffset.mockResolvedValueOnce([]);
    let whereCalls = 0;
    mockWhere.mockImplementation(() => {
      whereCalls++;
      if (whereCalls === 1) {
        return { orderBy: mockOrderBy, limit: mockLimit, where: mockWhere };
      }
      return Promise.resolve([{ count: 0 }]) as unknown as ReturnType<
        typeof mockWhere
      >;
    });

    await listScripts(TENANT_A, {}, { page: 2, pageSize: 10 });

    // limit(10) + offset(10)
    expect(mockLimit).toHaveBeenCalledWith(10);
    expect(mockOffset).toHaveBeenCalledWith(10);
  });
});

describe("getScriptById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("命中：返回带 tagIds 的话术对象", async () => {
    const row = {
      id: SCRIPT_ID_1,
      tenantId: TENANT_A,
      title: "T",
      status: "published",
    };
    // 主表查询：select-from-where 一次
    let whereCalls = 0;
    mockWhere.mockImplementation(() => {
      whereCalls++;
      if (whereCalls === 1) {
        return Promise.resolve([row]) as unknown as ReturnType<typeof mockWhere>;
      }
      // tags join：return [{ tagId }]
      return Promise.resolve([{ tagId: TAG_ID_1 }]) as unknown as ReturnType<
        typeof mockWhere
      >;
    });

    const result = await getScriptById(SCRIPT_ID_1, TENANT_A);

    expect(result).toMatchObject({ id: SCRIPT_ID_1, tagIds: [TAG_ID_1] });
  });

  it("跨租户：返回 null", async () => {
    mockWhere.mockImplementation(() => {
      // 主表 where 直接返回空
      return Promise.resolve([]) as unknown as ReturnType<typeof mockWhere>;
    });

    const result = await getScriptById(SCRIPT_ID_1, TENANT_B);
    expect(result).toBeNull();
  });
});

describe("createScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("事务内插入 scripts + script_tag_relations", async () => {
    const created = {
      id: SCRIPT_ID_1,
      tenantId: TENANT_A,
      title: "T",
      status: "draft",
    };
    mockReturning.mockResolvedValueOnce([created]);

    const result = await createScript(TENANT_A, USER_ID, {
      title: "T",
      customerQuestion: "Q",
      answer: "A",
      questionAliases: [],
      source: "curated",
      knowledgeId: KNOWLEDGE_ID,
      status: "draft",
      sceneTagIds: [TAG_ID_1],
      productTagIds: [TAG_ID_2],
    });

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        title: "T",
        createdBy: USER_ID,
      })
    );
    expect(result).toEqual({ ...created, tagIds: [TAG_ID_1, TAG_ID_2] });
  });

  it("无标签时不插入 relations", async () => {
    const created = { id: SCRIPT_ID_1, tenantId: TENANT_A, status: "draft" };
    mockReturning.mockResolvedValueOnce([created]);

    const result = await createScript(TENANT_A, USER_ID, {
      title: "T",
      customerQuestion: "Q",
      answer: "A",
      questionAliases: [],
      source: "curated",
      knowledgeId: null,
      status: "draft",
      sceneTagIds: [],
      productTagIds: [],
    });

    expect(result.tagIds).toEqual([]);
  });

  it("插入返回空数组时抛错", async () => {
    mockReturning.mockResolvedValueOnce([]);
    await expect(
      createScript(TENANT_A, USER_ID, {
        title: "T",
        customerQuestion: "Q",
        answer: "A",
        questionAliases: [],
        source: "curated",
        knowledgeId: null,
        status: "draft",
        sceneTagIds: [],
        productTagIds: [],
      })
    ).rejects.toThrow();
  });
});

describe("updateScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("仅更新主表字段：不重写关联标签", async () => {
    const updated = { id: SCRIPT_ID_1, title: "新", tenantId: TENANT_A };
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([updated]);
    // tags 关联查询返回空
    mockWhere.mockImplementationOnce(() =>
      Promise.resolve([]) as unknown as ReturnType<typeof mockWhere>
    );

    const result = await updateScript(TENANT_A, SCRIPT_ID_1, {
      title: "新",
    });

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ title: "新" }));
    // 没有提供 sceneTagIds/productTagIds → 不应触发 delete
    expect(mockDelete).not.toHaveBeenCalled();
    expect(result?.id).toBe(SCRIPT_ID_1);
  });

  it("提供 sceneTagIds：先 delete 再 insert", async () => {
    const updated = { id: SCRIPT_ID_1, title: "T", tenantId: TENANT_A };
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([updated]);
    // delete().where() resolves
    mockWhere.mockImplementationOnce(() =>
      Promise.resolve([]) as unknown as ReturnType<typeof mockWhere>
    );
    // tags join 查询
    mockWhere.mockImplementationOnce(() =>
      Promise.resolve([{ tagId: TAG_ID_1 }]) as unknown as ReturnType<
        typeof mockWhere
      >
    );

    await updateScript(TENANT_A, SCRIPT_ID_1, {
      sceneTagIds: [TAG_ID_1],
      productTagIds: [],
    });

    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });

  it("找不到记录返回 null", async () => {
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([]);

    const result = await updateScript(TENANT_A, SCRIPT_ID_1, { title: "T" });
    expect(result).toBeNull();
  });
});

describe("patchScriptStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("合法跳转 draft → pending_review：写入并返回新行", async () => {
    // 先 select 当前 status
    mockWhere.mockImplementationOnce(() =>
      Promise.resolve([
        { id: SCRIPT_ID_1, tenantId: TENANT_A, status: "draft" },
      ]) as unknown as ReturnType<typeof mockWhere>
    );
    // update().set().where().returning()
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([
      { id: SCRIPT_ID_1, status: "pending_review" },
    ]);

    const result = await patchScriptStatus(
      TENANT_A,
      SCRIPT_ID_1,
      "pending_review"
    );

    expect(result?.status).toBe("pending_review");
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending_review" })
    );
  });

  it("非法跳转 draft → published：抛 ScriptStateTransitionError", async () => {
    mockWhere.mockImplementationOnce(() =>
      Promise.resolve([
        { id: SCRIPT_ID_1, tenantId: TENANT_A, status: "draft" },
      ]) as unknown as ReturnType<typeof mockWhere>
    );

    await expect(
      patchScriptStatus(TENANT_A, SCRIPT_ID_1, "published")
    ).rejects.toBeInstanceOf(ScriptStateTransitionError);
  });

  it("找不到记录返回 null（不抛错）", async () => {
    mockWhere.mockImplementationOnce(() =>
      Promise.resolve([]) as unknown as ReturnType<typeof mockWhere>
    );
    const result = await patchScriptStatus(TENANT_A, SCRIPT_ID_1, "published");
    expect(result).toBeNull();
  });
});

describe("softDeleteScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("置 deleted_at = NOW()，租户 + id 双过滤", async () => {
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([
      { id: SCRIPT_ID_1, deletedAt: new Date() },
    ]);

    const result = await softDeleteScript(TENANT_A, SCRIPT_ID_1);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) })
    );
    expect(result?.id).toBe(SCRIPT_ID_1);
  });

  it("找不到记录返回 null", async () => {
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([]);
    expect(await softDeleteScript(TENANT_A, SCRIPT_ID_1)).toBeNull();
  });
});

describe("archiveScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("published → archived：合法", async () => {
    mockWhere.mockImplementationOnce(() =>
      Promise.resolve([
        { id: SCRIPT_ID_1, tenantId: TENANT_A, status: "published" },
      ]) as unknown as ReturnType<typeof mockWhere>
    );
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([
      { id: SCRIPT_ID_1, status: "archived" },
    ]);

    const result = await archiveScript(TENANT_A, SCRIPT_ID_1);
    expect(result?.status).toBe("archived");
  });

  it("draft → archived：状态机拒绝", async () => {
    mockWhere.mockImplementationOnce(() =>
      Promise.resolve([
        { id: SCRIPT_ID_1, tenantId: TENANT_A, status: "draft" },
      ]) as unknown as ReturnType<typeof mockWhere>
    );

    await expect(archiveScript(TENANT_A, SCRIPT_ID_1)).rejects.toBeInstanceOf(
      ScriptStateTransitionError
    );
  });
});
