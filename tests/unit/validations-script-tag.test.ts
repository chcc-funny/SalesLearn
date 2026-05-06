import { describe, expect, it } from "vitest";
import {
  createScriptTagSchema,
  updateScriptTagSchema,
  listScriptTagsQuerySchema,
  sortScriptTagsSchema,
} from "@/lib/validations/script-tag";
import { scriptTagGroupKeys } from "@/lib/db/schema/script-tags";

/**
 * unit09: lib/validations/script-tag.ts
 *
 * 覆盖 4 个 schema：
 *  - createScriptTagSchema
 *  - updateScriptTagSchema
 *  - listScriptTagsQuerySchema（含 queryBoolean preprocess 边界）
 *  - sortScriptTagsSchema
 */
const VALID_UUID_A = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";

describe("createScriptTagSchema", () => {
  it("最小负载：sortOrder 默认 0、isActive 默认 true", () => {
    const parsed = createScriptTagSchema.parse({
      groupKey: "scene",
      name: "首次进店",
    });
    expect(parsed.sortOrder).toBe(0);
    expect(parsed.isActive).toBe(true);
  });

  it("接受 product groupKey", () => {
    const parsed = createScriptTagSchema.parse({
      groupKey: "product",
      name: "隔热膜",
    });
    expect(parsed.groupKey).toBe("product");
  });

  it("接受所有合法 groupKey 枚举", () => {
    for (const gk of scriptTagGroupKeys) {
      const r = createScriptTagSchema.safeParse({ groupKey: gk, name: "x" });
      expect(r.success).toBe(true);
    }
  });

  it("拒绝非法 groupKey", () => {
    const r = createScriptTagSchema.safeParse({
      groupKey: "wrong",
      name: "x",
    });
    expect(r.success).toBe(false);
  });

  it("拒绝空 name", () => {
    const r = createScriptTagSchema.safeParse({
      groupKey: "scene",
      name: "",
    });
    expect(r.success).toBe(false);
  });

  it("拒绝 name 超过 50 字符", () => {
    const r = createScriptTagSchema.safeParse({
      groupKey: "scene",
      name: "a".repeat(51),
    });
    expect(r.success).toBe(false);
  });

  it("接受 name 恰好 50 字符（边界）", () => {
    const parsed = createScriptTagSchema.parse({
      groupKey: "scene",
      name: "a".repeat(50),
    });
    expect(parsed.name).toHaveLength(50);
  });

  it("拒绝负 sortOrder", () => {
    const r = createScriptTagSchema.safeParse({
      groupKey: "product",
      name: "膜A",
      sortOrder: -1,
    });
    expect(r.success).toBe(false);
  });

  it("拒绝非整数 sortOrder", () => {
    const r = createScriptTagSchema.safeParse({
      groupKey: "scene",
      name: "x",
      sortOrder: 1.5,
    });
    expect(r.success).toBe(false);
  });

  it("拒绝 sortOrder 超过 9999", () => {
    const r = createScriptTagSchema.safeParse({
      groupKey: "scene",
      name: "x",
      sortOrder: 10000,
    });
    expect(r.success).toBe(false);
  });

  it("接受显式 isActive=false", () => {
    const parsed = createScriptTagSchema.parse({
      groupKey: "scene",
      name: "停用项",
      isActive: false,
    });
    expect(parsed.isActive).toBe(false);
  });
});

describe("updateScriptTagSchema", () => {
  it("接受单字段更新（isActive）", () => {
    const parsed = updateScriptTagSchema.parse({ isActive: false });
    expect(parsed.isActive).toBe(false);
  });

  it("接受多字段更新", () => {
    const parsed = updateScriptTagSchema.parse({
      name: "新名",
      sortOrder: 3,
    });
    expect(parsed.name).toBe("新名");
    expect(parsed.sortOrder).toBe(3);
  });

  it("拒绝空对象（必须至少一个字段）", () => {
    const r = updateScriptTagSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("拒绝非整数 sortOrder", () => {
    const r = updateScriptTagSchema.safeParse({ sortOrder: 1.5 });
    expect(r.success).toBe(false);
  });

  it("拒绝负 sortOrder", () => {
    const r = updateScriptTagSchema.safeParse({ sortOrder: -1 });
    expect(r.success).toBe(false);
  });

  it("拒绝 name 超过 50 字符", () => {
    const r = updateScriptTagSchema.safeParse({ name: "a".repeat(51) });
    expect(r.success).toBe(false);
  });
});

describe("listScriptTagsQuerySchema (queryBoolean preprocess)", () => {
  it("空对象使用默认值（onlyActive=true）", () => {
    const parsed = listScriptTagsQuerySchema.parse({});
    expect(parsed.onlyActive).toBe(true);
  });

  it("接受 boolean 直传 true", () => {
    const parsed = listScriptTagsQuerySchema.parse({ onlyActive: true });
    expect(parsed.onlyActive).toBe(true);
  });

  it("接受 boolean 直传 false", () => {
    const parsed = listScriptTagsQuerySchema.parse({ onlyActive: false });
    expect(parsed.onlyActive).toBe(false);
  });

  it('字符串 "true" → true', () => {
    const parsed = listScriptTagsQuerySchema.parse({ onlyActive: "true" });
    expect(parsed.onlyActive).toBe(true);
  });

  it('字符串 "1" → true', () => {
    const parsed = listScriptTagsQuerySchema.parse({ onlyActive: "1" });
    expect(parsed.onlyActive).toBe(true);
  });

  it('字符串 "false" → false（不能踩 z.coerce.boolean 坑）', () => {
    const parsed = listScriptTagsQuerySchema.parse({ onlyActive: "false" });
    expect(parsed.onlyActive).toBe(false);
  });

  it('字符串 "0" → false', () => {
    const parsed = listScriptTagsQuerySchema.parse({ onlyActive: "0" });
    expect(parsed.onlyActive).toBe(false);
  });

  it("非法字符串（不在白名单）被拒绝", () => {
    const r = listScriptTagsQuerySchema.safeParse({ onlyActive: "yes" });
    expect(r.success).toBe(false);
  });

  it("数字 1 不被识别为 true（preprocess 仅处理 string）", () => {
    const r = listScriptTagsQuerySchema.safeParse({ onlyActive: 1 });
    expect(r.success).toBe(false);
  });

  it("接受可选 groupKey=scene", () => {
    const parsed = listScriptTagsQuerySchema.parse({ groupKey: "scene" });
    expect(parsed.groupKey).toBe("scene");
  });

  it("接受可选 groupKey=product", () => {
    const parsed = listScriptTagsQuerySchema.parse({ groupKey: "product" });
    expect(parsed.groupKey).toBe("product");
  });

  it("拒绝非法 groupKey", () => {
    const r = listScriptTagsQuerySchema.safeParse({ groupKey: "nope" });
    expect(r.success).toBe(false);
  });
});

describe("sortScriptTagsSchema", () => {
  it("接受 scene + 2 个 UUID", () => {
    const parsed = sortScriptTagsSchema.parse({
      groupKey: "scene",
      orderedIds: [VALID_UUID_A, VALID_UUID_B],
    });
    expect(parsed.orderedIds).toHaveLength(2);
  });

  it("接受 product + 1 个 UUID", () => {
    const parsed = sortScriptTagsSchema.parse({
      groupKey: "product",
      orderedIds: [VALID_UUID_A],
    });
    expect(parsed.groupKey).toBe("product");
  });

  it("拒绝空 orderedIds", () => {
    const r = sortScriptTagsSchema.safeParse({
      groupKey: "scene",
      orderedIds: [],
    });
    expect(r.success).toBe(false);
  });

  it("拒绝 orderedIds 超过 100 个", () => {
    const r = sortScriptTagsSchema.safeParse({
      groupKey: "scene",
      orderedIds: Array.from({ length: 101 }, () => VALID_UUID_A),
    });
    expect(r.success).toBe(false);
  });

  it("拒绝 orderedIds 含非 UUID", () => {
    const r = sortScriptTagsSchema.safeParse({
      groupKey: "product",
      orderedIds: ["not-uuid"],
    });
    expect(r.success).toBe(false);
  });

  it("拒绝非法 groupKey", () => {
    const r = sortScriptTagsSchema.safeParse({
      groupKey: "wrong",
      orderedIds: [VALID_UUID_A],
    });
    expect(r.success).toBe(false);
  });

  it("拒绝缺失 groupKey", () => {
    const r = sortScriptTagsSchema.safeParse({
      orderedIds: [VALID_UUID_A],
    });
    expect(r.success).toBe(false);
  });
});
