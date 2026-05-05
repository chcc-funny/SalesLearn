import { describe, expect, it } from "vitest";
import {
  createScriptSchema,
  updateScriptSchema,
  listScriptsQuerySchema,
  copyScriptSchema,
  generateScriptSchema,
  submitScriptSchema,
  reviewScriptSchema,
  GENERATE_QUESTION_MAX_LENGTH,
} from "@/lib/validations/script";
import { scriptStatuses, scriptSources } from "@/lib/db/schema/scripts";

/**
 * unit09: lib/validations/script.ts
 *
 * 覆盖目标：
 *  - 7 个 schema 全覆盖（create / update / list-query / copy / generate / submit / review）
 *  - 字段长度边界 / enum 合法性 / 必填可选 / discriminated union 分支
 *  - 用 expect(...).toThrow() / safeParse 而非 try-catch（避免假绿）
 *
 * 共享 fixture：
 */
const VALID_UUID_A = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";
const VALID_UUID_C = "33333333-3333-4333-8333-333333333333";

describe("createScriptSchema", () => {
  const baseValid = {
    title: "如何介绍量子膜",
    customerQuestion: "你们的膜跟3M有什么区别？",
    answer: "我们的膜在隔热和清晰度上都优于3M。",
    source: "curated" as const,
  };

  it("最小有效负载：默认值正确填充", () => {
    const parsed = createScriptSchema.parse(baseValid);
    expect(parsed.status).toBe("draft");
    expect(parsed.sceneTagIds).toEqual([]);
    expect(parsed.productTagIds).toEqual([]);
    expect(parsed.questionAliases).toEqual([]);
  });

  it("接受 published 作为 status（创建时直接发布）", () => {
    const parsed = createScriptSchema.parse({ ...baseValid, status: "published" });
    expect(parsed.status).toBe("published");
  });

  it("拒绝 pending_review/rejected/archived 作为 status（仅允许 draft/published）", () => {
    const blocked = ["pending_review", "rejected", "archived"] as const;
    for (const s of blocked) {
      const r = createScriptSchema.safeParse({ ...baseValid, status: s });
      expect(r.success).toBe(false);
    }
  });

  it("拒绝空 title", () => {
    const r = createScriptSchema.safeParse({ ...baseValid, title: "" });
    expect(r.success).toBe(false);
  });

  it("拒绝 title 超过 200 字符", () => {
    const r = createScriptSchema.safeParse({
      ...baseValid,
      title: "a".repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it("接受 title 恰好 200 字符（边界）", () => {
    const parsed = createScriptSchema.parse({
      ...baseValid,
      title: "a".repeat(200),
    });
    expect(parsed.title).toHaveLength(200);
  });

  it("拒绝空 customerQuestion", () => {
    const r = createScriptSchema.safeParse({ ...baseValid, customerQuestion: "" });
    expect(r.success).toBe(false);
  });

  it("拒绝 customerQuestion 超过 2000 字符", () => {
    const r = createScriptSchema.safeParse({
      ...baseValid,
      customerQuestion: "x".repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  it("拒绝空 answer", () => {
    const r = createScriptSchema.safeParse({ ...baseValid, answer: "" });
    expect(r.success).toBe(false);
  });

  it("拒绝 answer 超过 10000 字符", () => {
    const r = createScriptSchema.safeParse({
      ...baseValid,
      answer: "y".repeat(10001),
    });
    expect(r.success).toBe(false);
  });

  it("拒绝非法 source 枚举", () => {
    const r = createScriptSchema.safeParse({
      ...baseValid,
      source: "not_a_real_source",
    });
    expect(r.success).toBe(false);
  });

  it("接受所有合法 source 枚举", () => {
    for (const src of scriptSources) {
      const r = createScriptSchema.safeParse({ ...baseValid, source: src });
      expect(r.success).toBe(true);
    }
  });

  it("接受 questionAliases 数组", () => {
    const parsed = createScriptSchema.parse({
      ...baseValid,
      questionAliases: ["同义问题1", "同义问题2"],
    });
    expect(parsed.questionAliases).toHaveLength(2);
  });

  it("拒绝 questionAliases 超过 10 条", () => {
    const r = createScriptSchema.safeParse({
      ...baseValid,
      questionAliases: Array.from({ length: 11 }, (_, i) => `q${i}`),
    });
    expect(r.success).toBe(false);
  });

  it("拒绝 questionAlias 中单条超过 500 字符", () => {
    const r = createScriptSchema.safeParse({
      ...baseValid,
      questionAliases: ["a".repeat(501)],
    });
    expect(r.success).toBe(false);
  });

  it("接受 knowledgeId 为合法 UUID", () => {
    const parsed = createScriptSchema.parse({
      ...baseValid,
      knowledgeId: VALID_UUID_A,
    });
    expect(parsed.knowledgeId).toBe(VALID_UUID_A);
  });

  it("接受 knowledgeId 为 null", () => {
    const parsed = createScriptSchema.parse({ ...baseValid, knowledgeId: null });
    expect(parsed.knowledgeId).toBeNull();
  });

  it("拒绝 knowledgeId 为非 UUID 字符串", () => {
    const r = createScriptSchema.safeParse({
      ...baseValid,
      knowledgeId: "not-a-uuid",
    });
    expect(r.success).toBe(false);
  });

  it("拒绝 sceneTagIds 中含非 UUID", () => {
    const r = createScriptSchema.safeParse({
      ...baseValid,
      sceneTagIds: ["not-uuid"],
    });
    expect(r.success).toBe(false);
  });

  it("拒绝 productTagIds 超过 20 个", () => {
    const r = createScriptSchema.safeParse({
      ...baseValid,
      productTagIds: Array.from({ length: 21 }, () => VALID_UUID_A),
    });
    expect(r.success).toBe(false);
  });
});

describe("updateScriptSchema", () => {
  it("接受单字段更新", () => {
    const parsed = updateScriptSchema.parse({ title: "新标题" });
    expect(parsed.title).toBe("新标题");
  });

  it("接受多字段更新", () => {
    const parsed = updateScriptSchema.parse({
      title: "T",
      answer: "A",
      sceneTagIds: [VALID_UUID_A],
    });
    expect(parsed.sceneTagIds).toEqual([VALID_UUID_A]);
  });

  it("拒绝空对象（必须至少有一个字段）", () => {
    const r = updateScriptSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("拒绝 title 超长", () => {
    const r = updateScriptSchema.safeParse({ title: "a".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("拒绝 customerQuestion 超长", () => {
    const r = updateScriptSchema.safeParse({
      customerQuestion: "x".repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  it("拒绝 answer 超长", () => {
    const r = updateScriptSchema.safeParse({ answer: "y".repeat(10001) });
    expect(r.success).toBe(false);
  });

  it("接受 knowledgeId 为 null（解除关联）", () => {
    const parsed = updateScriptSchema.parse({ knowledgeId: null });
    expect(parsed.knowledgeId).toBeNull();
  });

  it("接受 questionAliases 数组（≤10 条）", () => {
    const parsed = updateScriptSchema.parse({
      questionAliases: ["q1", "q2"],
    });
    expect(parsed.questionAliases).toEqual(["q1", "q2"]);
  });

  it("拒绝 questionAliases 超过 10 条", () => {
    const r = updateScriptSchema.safeParse({
      questionAliases: Array.from({ length: 11 }, (_, i) => `q${i}`),
    });
    expect(r.success).toBe(false);
  });

  it("拒绝 sceneTagIds 中非 UUID", () => {
    const r = updateScriptSchema.safeParse({
      sceneTagIds: ["bad-id"],
    });
    expect(r.success).toBe(false);
  });
});

describe("listScriptsQuerySchema", () => {
  it("空对象使用默认值", () => {
    const parsed = listScriptsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.sceneTagIds).toEqual([]);
    expect(parsed.productTagIds).toEqual([]);
  });

  it("数字字符串自动转换为 number（page/pageSize）", () => {
    const parsed = listScriptsQuerySchema.parse({ page: "3", pageSize: "50" });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it("拒绝 pageSize 超过 100", () => {
    const r = listScriptsQuerySchema.safeParse({ pageSize: 999 });
    expect(r.success).toBe(false);
  });

  it("拒绝 page < 1", () => {
    const r = listScriptsQuerySchema.safeParse({ page: 0 });
    expect(r.success).toBe(false);
  });

  it("拒绝 pageSize < 1", () => {
    const r = listScriptsQuerySchema.safeParse({ pageSize: 0 });
    expect(r.success).toBe(false);
  });

  it("接受所有合法 status 枚举", () => {
    for (const s of scriptStatuses) {
      const parsed = listScriptsQuerySchema.parse({ status: s });
      expect(parsed.status).toBe(s);
    }
  });

  it("拒绝非法 status", () => {
    const r = listScriptsQuerySchema.safeParse({ status: "wat" });
    expect(r.success).toBe(false);
  });

  it("接受所有合法 source 枚举", () => {
    for (const src of scriptSources) {
      const parsed = listScriptsQuerySchema.parse({ source: src });
      expect(parsed.source).toBe(src);
    }
  });

  it("拒绝 q 超过 200 字符", () => {
    const r = listScriptsQuerySchema.safeParse({ q: "a".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("拒绝 sceneTagIds 含非 UUID", () => {
    const r = listScriptsQuerySchema.safeParse({ sceneTagIds: ["bad"] });
    expect(r.success).toBe(false);
  });

  it("拒绝 sceneTagIds 超过 10 个", () => {
    const r = listScriptsQuerySchema.safeParse({
      sceneTagIds: Array.from({ length: 11 }, () => VALID_UUID_A),
    });
    expect(r.success).toBe(false);
  });
});

describe("copyScriptSchema (strict empty body)", () => {
  it("接受空对象", () => {
    expect(copyScriptSchema.parse({})).toEqual({});
  });

  it("拒绝任何额外字段（strict）", () => {
    const r = copyScriptSchema.safeParse({ foo: 1 });
    expect(r.success).toBe(false);
  });

  it("拒绝 null 输入", () => {
    const r = copyScriptSchema.safeParse(null);
    expect(r.success).toBe(false);
  });
});

describe("generateScriptSchema (Prompt Injection 防护)", () => {
  it("接受合理长度的客户问题", () => {
    const parsed = generateScriptSchema.parse({
      customerQuestion: "你们的膜质保多久？",
    });
    expect(parsed.customerQuestion).toContain("质保");
  });

  it("拒绝空字符串", () => {
    const r = generateScriptSchema.safeParse({ customerQuestion: "" });
    expect(r.success).toBe(false);
  });

  it(`接受恰好 ${GENERATE_QUESTION_MAX_LENGTH} 字符（上界）`, () => {
    const parsed = generateScriptSchema.parse({
      customerQuestion: "a".repeat(GENERATE_QUESTION_MAX_LENGTH),
    });
    expect(parsed.customerQuestion).toHaveLength(GENERATE_QUESTION_MAX_LENGTH);
  });

  it(`拒绝超过 ${GENERATE_QUESTION_MAX_LENGTH} 字符`, () => {
    const r = generateScriptSchema.safeParse({
      customerQuestion: "x".repeat(GENERATE_QUESTION_MAX_LENGTH + 1),
    });
    expect(r.success).toBe(false);
  });

  it("拒绝缺少 customerQuestion 字段", () => {
    const r = generateScriptSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("submitScriptSchema", () => {
  const baseValid = {
    requestId: VALID_UUID_A,
    title: "T",
    customerQuestion: "Q",
    answer: "A",
  };

  it("最小负载：requestId + 必填字段，标签默认空", () => {
    const parsed = submitScriptSchema.parse(baseValid);
    expect(parsed.requestId).toBe(VALID_UUID_A);
    expect(parsed.sceneTagIds).toEqual([]);
    expect(parsed.productTagIds).toEqual([]);
  });

  it("接受 knowledgeId 为 null", () => {
    const parsed = submitScriptSchema.parse({
      ...baseValid,
      knowledgeId: null,
    });
    expect(parsed.knowledgeId).toBeNull();
  });

  it("接受 knowledgeId 为合法 UUID", () => {
    const parsed = submitScriptSchema.parse({
      ...baseValid,
      knowledgeId: VALID_UUID_B,
    });
    expect(parsed.knowledgeId).toBe(VALID_UUID_B);
  });

  it("拒绝 requestId 非 UUID", () => {
    const r = submitScriptSchema.safeParse({
      ...baseValid,
      requestId: "not-a-uuid",
    });
    expect(r.success).toBe(false);
  });

  it("拒绝缺少 answer", () => {
    const r = submitScriptSchema.safeParse({
      requestId: VALID_UUID_A,
      title: "T",
      customerQuestion: "Q",
    });
    expect(r.success).toBe(false);
  });

  it("拒绝缺少 title", () => {
    const r = submitScriptSchema.safeParse({
      requestId: VALID_UUID_A,
      customerQuestion: "Q",
      answer: "A",
    });
    expect(r.success).toBe(false);
  });

  it("拒绝标签数量超过 20", () => {
    const r = submitScriptSchema.safeParse({
      ...baseValid,
      sceneTagIds: Array.from({ length: 21 }, () => VALID_UUID_C),
    });
    expect(r.success).toBe(false);
  });
});

describe("reviewScriptSchema (discriminated union)", () => {
  it("approve：无 edits 合法", () => {
    const parsed = reviewScriptSchema.parse({ action: "approve" });
    expect(parsed.action).toBe("approve");
  });

  it("approve：含部分 edits 合法", () => {
    const parsed = reviewScriptSchema.parse({
      action: "approve",
      edits: { title: "改后的标题", answer: "改后的答案" },
    });
    expect(parsed.action).toBe("approve");
    if (parsed.action === "approve") {
      expect(parsed.edits?.title).toBe("改后的标题");
    }
  });

  it("approve：edits 中字段超长被拒绝", () => {
    const r = reviewScriptSchema.safeParse({
      action: "approve",
      edits: { title: "a".repeat(201) },
    });
    expect(r.success).toBe(false);
  });

  it("reject：必须带 rejectReason", () => {
    const parsed = reviewScriptSchema.parse({
      action: "reject",
      rejectReason: "答案不准确",
    });
    expect(parsed.action).toBe("reject");
  });

  it("reject：缺 rejectReason 被拒绝", () => {
    const r = reviewScriptSchema.safeParse({ action: "reject" });
    expect(r.success).toBe(false);
  });

  it("reject：rejectReason 空字符串被拒绝", () => {
    const r = reviewScriptSchema.safeParse({
      action: "reject",
      rejectReason: "",
    });
    expect(r.success).toBe(false);
  });

  it("reject：rejectReason 超过 500 字符被拒绝", () => {
    const r = reviewScriptSchema.safeParse({
      action: "reject",
      rejectReason: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it("非法 action 被拒绝", () => {
    const r = reviewScriptSchema.safeParse({ action: "explode" });
    expect(r.success).toBe(false);
  });

  it("缺失 action 被拒绝", () => {
    const r = reviewScriptSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
