import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * unit11: lib/services/scripts/tags.ts
 *
 * 单元测试目标（依赖 db，必须 mock）：
 *  - listTags(tenantId, { onlyActive }) 走 select+from+where+orderBy 链路
 *  - createTag / updateTag 调用 returning() 返回单行
 *  - softDeleteTag = update isActive=false（不删行）
 *  - sortTags = 顺序更新 sortOrder（含批量）
 *  - 所有写操作必须 WHERE tenantId
 *
 * Mock 思路：
 *  - vi.hoisted 维护一组 chain mock
 *  - 通过 currentScene 指定单次调用返回值
 *  - 不走真实 drizzle / Neon
 */
const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockOrderBy,
  mockUpdate,
  mockInsert,
  mockSet,
  mockValues,
  mockReturning,
  wireChain,
} = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockValues = vi.fn();
  const mockInsert = vi.fn();
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();

  function wireChain() {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({
      orderBy: mockOrderBy,
      where: mockWhere,
    });
    mockOrderBy.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
  }

  wireChain();

  return {
    mockSelect,
    mockFrom,
    mockWhere,
    mockOrderBy,
    mockUpdate,
    mockInsert,
    mockSet,
    mockValues,
    mockReturning,
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

import {
  listTags,
  createTag,
  updateTag,
  softDeleteTag,
  sortTags,
} from "@/lib/services/scripts/tags";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TAG_ID_1 = "22222222-2222-4222-8222-222222222222";
const TAG_ID_2 = "33333333-3333-4333-8333-333333333333";

describe("listTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("默认 onlyActive=true：返回标签数组", async () => {
    const tags = [
      {
        id: TAG_ID_1,
        tenantId: TENANT_A,
        groupKey: "scene",
        name: "首次进店",
        sortOrder: 0,
        isActive: true,
      },
    ];
    mockOrderBy.mockResolvedValueOnce(tags);

    const result = await listTags(TENANT_A);

    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockOrderBy).toHaveBeenCalled();
    expect(result).toEqual(tags);
  });

  it("onlyActive=false：返回包含已停用标签", async () => {
    const tags = [
      { id: TAG_ID_1, isActive: true },
      { id: TAG_ID_2, isActive: false },
    ];
    mockOrderBy.mockResolvedValueOnce(tags);

    const result = await listTags(TENANT_A, { onlyActive: false });
    expect(result).toHaveLength(2);
  });

  it("可按 groupKey 过滤", async () => {
    mockOrderBy.mockResolvedValueOnce([]);
    await listTags(TENANT_A, { groupKey: "product" });
    expect(mockWhere).toHaveBeenCalled();
  });
});

describe("createTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("插入并返回新行", async () => {
    const created = {
      id: TAG_ID_1,
      tenantId: TENANT_A,
      groupKey: "scene",
      name: "首次进店",
      sortOrder: 0,
      isActive: true,
    };
    mockReturning.mockResolvedValueOnce([created]);

    const result = await createTag(TENANT_A, {
      groupKey: "scene",
      name: "首次进店",
      sortOrder: 0,
      isActive: true,
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        groupKey: "scene",
        name: "首次进店",
      })
    );
    expect(result).toEqual(created);
  });

  it("插入失败返回空数组时抛错", async () => {
    mockReturning.mockResolvedValueOnce([]);
    await expect(
      createTag(TENANT_A, {
        groupKey: "scene",
        name: "x",
        sortOrder: 0,
        isActive: true,
      })
    ).rejects.toThrow();
  });
});

describe("updateTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("调用 update + set + where(tenantId+id) + returning", async () => {
    const updated = {
      id: TAG_ID_1,
      tenantId: TENANT_A,
      name: "改后的名",
      isActive: true,
    };
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([updated]);

    const result = await updateTag(TENANT_A, TAG_ID_1, { name: "改后的名" });

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: "改后的名" })
    );
    expect(mockWhere).toHaveBeenCalled();
    expect(result).toEqual(updated);
  });

  it("找不到记录（returning 空）返回 null", async () => {
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([]);
    const result = await updateTag(TENANT_A, TAG_ID_1, { name: "x" });
    expect(result).toBeNull();
  });
});

describe("softDeleteTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("置 isActive=false 不真删行", async () => {
    const softDeleted = { id: TAG_ID_1, isActive: false };
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([softDeleted]);

    const result = await softDeleteTag(TENANT_A, TAG_ID_1);

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false })
    );
    expect(result).toEqual(softDeleted);
  });

  it("找不到记录返回 null", async () => {
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockReturning.mockResolvedValueOnce([]);
    expect(await softDeleteTag(TENANT_A, TAG_ID_1)).toBeNull();
  });
});

describe("sortTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("按 orderedIds 顺序为每个 id 发一条 update（sortOrder=index）", async () => {
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([{ id: "x" }]);

    await sortTags(TENANT_A, "scene", [TAG_ID_1, TAG_ID_2]);

    // 至少调用了 2 次 update（每个 id 一次）
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    // 第一次 sortOrder=0, 第二次 sortOrder=1
    expect(mockSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sortOrder: 0 })
    );
    expect(mockSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sortOrder: 1 })
    );
  });

  it("空 orderedIds 不发出 update", async () => {
    await sortTags(TENANT_A, "scene", []);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
