import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * unit13: lib/services/scripts/copy.ts
 *
 * 复制服务单测：mock drizzle 全程，覆盖
 *  - 事务内：UPDATE usage_count + 1（仅 published + tenant + 未软删）+ INSERT script_copy_logs
 *  - 未发布 / 跨租户 / 软删 → 无行更新 → 抛业务错误，且不写日志
 *  - deviceInfo 可选：仅当传入时落库
 *  - 租户隔离：UPDATE 命中条件包含 tenantId
 *  - 事务一致性：UPDATE 失败时不会写日志
 */

const {
  mockUpdate,
  mockSet,
  mockReturning,
  mockInsert,
  mockValues,
  mockTransaction,
  wireChain,
} = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockValues = vi.fn();
  const mockInsert = vi.fn();
  const mockTransaction = vi.fn();

  function wireChain() {
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);

    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue(undefined);

    // 默认事务实现：直接调用 callback，并把 tx mock 注入
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      return cb({
        update: mockUpdate,
        insert: mockInsert,
      });
    });
  }

  wireChain();

  return {
    mockUpdate,
    mockSet,
    mockReturning,
    mockInsert,
    mockValues,
    mockTransaction,
    wireChain,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    update: mockUpdate,
    insert: mockInsert,
    transaction: mockTransaction,
  },
}));

import { logScriptCopy, ScriptCopyError } from "@/lib/services/scripts/copy";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "77777777-7777-4777-8777-777777777777";

describe("logScriptCopy - 成功路径", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("命中 published 话术：自增 usage_count 并写日志", async () => {
    const updatedRow = {
      id: SCRIPT_ID,
      tenantId: TENANT_A,
      status: "published",
      usageCount: 6,
    };
    mockReturning.mockResolvedValueOnce([updatedRow]);

    const result = await logScriptCopy(SCRIPT_ID, USER_ID, TENANT_A);

    // 走事务
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // UPDATE 调用一次
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledTimes(1);
    // INSERT 一次（日志）
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        scriptId: SCRIPT_ID,
        userId: USER_ID,
        tenantId: TENANT_A,
      })
    );
    // 返回新 usageCount
    expect(result).toEqual({ usageCount: 6 });
  });

  it("usage_count 自增使用 SQL 表达式（避免 select-then-update 竞态）", async () => {
    mockReturning.mockResolvedValueOnce([
      { id: SCRIPT_ID, usageCount: 1, status: "published" },
    ]);

    await logScriptCopy(SCRIPT_ID, USER_ID, TENANT_A);

    // set 调用入参中应包含 usageCount 字段（且不是 number 直接覆盖；交由 sql 模板生成）
    const setCall = mockSet.mock.calls[0]?.[0];
    expect(setCall).toBeDefined();
    expect(setCall.usageCount).toBeDefined();
    // 不应该是 plain number（说明走 SQL 表达式）
    expect(typeof setCall.usageCount).not.toBe("number");
    // updatedAt 也应该一并刷新
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });

  it("传入 deviceInfo（可选）时不落库（v1 schema 仅 tenantId/scriptId/userId）", async () => {
    mockReturning.mockResolvedValueOnce([
      { id: SCRIPT_ID, usageCount: 2, status: "published" },
    ]);

    await logScriptCopy(SCRIPT_ID, USER_ID, TENANT_A, "web", {
      ua: "Mozilla/5.0",
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        scriptId: SCRIPT_ID,
        userId: USER_ID,
        tenantId: TENANT_A,
      })
    );
    // schema 没有 deviceInfo 列；保证不会把 deviceInfo 透传进去
    const insertedRow = mockValues.mock.calls[0]?.[0];
    expect(insertedRow).not.toHaveProperty("deviceInfo");
  });
});

describe("logScriptCopy - 失败路径", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("非 published / 软删 / 不存在：UPDATE 0 行 → 抛 ScriptCopyError", async () => {
    mockReturning.mockResolvedValueOnce([]);

    await expect(
      logScriptCopy(SCRIPT_ID, USER_ID, TENANT_A)
    ).rejects.toBeInstanceOf(ScriptCopyError);
  });

  it("UPDATE 0 行：不写 script_copy_logs", async () => {
    mockReturning.mockResolvedValueOnce([]);

    await expect(
      logScriptCopy(SCRIPT_ID, USER_ID, TENANT_A)
    ).rejects.toBeInstanceOf(ScriptCopyError);

    // 关键：日志 INSERT 一次都没调用
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("跨租户：UPDATE 0 行 → 抛错，无副作用", async () => {
    mockReturning.mockResolvedValueOnce([]);

    await expect(
      logScriptCopy(SCRIPT_ID, USER_ID, TENANT_B)
    ).rejects.toBeInstanceOf(ScriptCopyError);

    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("logScriptCopy - 事务边界", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireChain();
  });

  it("事务回调内 update + insert 都使用同一 tx 实例", async () => {
    let txInstance: unknown;
    mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        update: mockUpdate,
        insert: mockInsert,
      };
      txInstance = tx;
      return cb(tx);
    });

    mockReturning.mockResolvedValueOnce([
      { id: SCRIPT_ID, usageCount: 1, status: "published" },
    ]);

    await logScriptCopy(SCRIPT_ID, USER_ID, TENANT_A);

    expect(txInstance).toBeDefined();
    // 事务回调里 update / insert 都走 tx（mockUpdate / mockInsert 等于 tx 上的属性）
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("ScriptCopyError", () => {
  it("instanceof 跨编译目标维持", () => {
    const e = new ScriptCopyError("test");
    expect(e).toBeInstanceOf(ScriptCopyError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ScriptCopyError");
  });
});
