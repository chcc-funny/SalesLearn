import { describe, it, expect } from "vitest";
import {
  createKnowledgeSchema,
  updateKnowledgeSchema,
  batchKnowledgeSchema,
} from "@/lib/validations/knowledge";

describe("createKnowledgeSchema", () => {
  const validInput = {
    title: "产品介绍",
    category: "product" as const,
    content: "详细内容",
  };

  it("accepts a valid payload with required fields only", () => {
    const result = createKnowledgeSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      // defaults applied
      expect(result.data.keyPoints).toEqual([]);
      expect(result.data.images).toEqual([]);
    }
  });

  it("accepts all four valid category values", () => {
    const categories = ["product", "objection", "closing", "psychology"] as const;
    for (const category of categories) {
      const result = createKnowledgeSchema.safeParse({ ...validInput, category });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid category", () => {
    const result = createKnowledgeSchema.safeParse({ ...validInput, category: "unknown" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("product");
    }
  });

  it("rejects an empty title", () => {
    const result = createKnowledgeSchema.safeParse({ ...validInput, title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("标题不能为空");
    }
  });

  it("rejects a title exceeding 200 characters", () => {
    const longTitle = "a".repeat(201);
    const result = createKnowledgeSchema.safeParse({ ...validInput, title: longTitle });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("标题不能超过200个字符");
    }
  });

  it("rejects empty content", () => {
    const result = createKnowledgeSchema.safeParse({ ...validInput, content: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("内容不能为空");
    }
  });

  it("accepts optional fields examples and commonMistakes", () => {
    const result = createKnowledgeSchema.safeParse({
      ...validInput,
      examples: "示例文本",
      commonMistakes: "常见错误",
      keyPoints: ["要点1", "要点2"],
      images: ["https://example.com/img.png"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.examples).toBe("示例文本");
      expect(result.data.keyPoints).toEqual(["要点1", "要点2"]);
    }
  });

  it("rejects missing required fields", () => {
    const result = createKnowledgeSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("updateKnowledgeSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const result = updateKnowledgeSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only title", () => {
    const result = updateKnowledgeSchema.safeParse({ title: "新标题" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("新标题");
    }
  });

  it("rejects invalid category in update", () => {
    const result = updateKnowledgeSchema.safeParse({ category: "bad" });
    expect(result.success).toBe(false);
  });

  it("accepts nullable examples and commonMistakes", () => {
    const result = updateKnowledgeSchema.safeParse({
      examples: null,
      commonMistakes: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title string on update", () => {
    const result = updateKnowledgeSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("包含 status=published 合法", () => {
    const result = updateKnowledgeSchema.safeParse({ status: "published" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("published");
    }
  });

  it("包含 status=reviewing 合法", () => {
    const result = updateKnowledgeSchema.safeParse({ status: "reviewing" });
    expect(result.success).toBe(true);
  });

  it("包含 status=draft 合法", () => {
    const result = updateKnowledgeSchema.safeParse({ status: "draft" });
    expect(result.success).toBe(true);
  });

  it("包含 status=invalid 返回报错", () => {
    const result = updateKnowledgeSchema.safeParse({ status: "invalid" });
    expect(result.success).toBe(false);
  });
});

const VALID_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const VALID_UUID_2 = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

describe("batchKnowledgeSchema", () => {
  describe("publish action", () => {
    it("publish 合法", () => {
      const result = batchKnowledgeSchema.safeParse({
        action: "publish",
        ids: [VALID_UUID],
      });
      expect(result.success).toBe(true);
    });

    it("publish 多个 ids 合法", () => {
      const result = batchKnowledgeSchema.safeParse({
        action: "publish",
        ids: [VALID_UUID, VALID_UUID_2],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("delete action", () => {
    it("delete 合法", () => {
      const result = batchKnowledgeSchema.safeParse({
        action: "delete",
        ids: [VALID_UUID],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("setCategory action", () => {
    it("setCategory 合法", () => {
      const result = batchKnowledgeSchema.safeParse({
        action: "setCategory",
        ids: [VALID_UUID],
        category: "product",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe("setCategory");
        if (result.data.action === "setCategory") {
          expect(result.data.category).toBe("product");
        }
      }
    });

    it("setCategory 缺少 category 字段 → 报错", () => {
      const result = batchKnowledgeSchema.safeParse({
        action: "setCategory",
        ids: [VALID_UUID],
      });
      expect(result.success).toBe(false);
    });

    it("setCategory category 为非法值 → 报错", () => {
      const result = batchKnowledgeSchema.safeParse({
        action: "setCategory",
        ids: [VALID_UUID],
        category: "bad_cat",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ids 校验", () => {
    it("ids 为空数组 → 报错", () => {
      const result = batchKnowledgeSchema.safeParse({
        action: "publish",
        ids: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("至少选择一个");
      }
    });

    it("ids 超过 100 个 → 报错", () => {
      const ids = Array.from({ length: 101 }, (_, i) => {
        const hex = i.toString(16).padStart(8, "0");
        return `${hex}-e5f6-4a7b-8c9d-0e1f2a3b4c5d`;
      });
      const result = batchKnowledgeSchema.safeParse({
        action: "publish",
        ids,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("100");
      }
    });

    it("ids 恰好 100 个 → 合法", () => {
      const ids = Array.from({ length: 100 }, (_, i) => {
        const hex = i.toString(16).padStart(8, "0");
        return `${hex}-e5f6-4a7b-8c9d-0e1f2a3b4c5d`;
      });
      const result = batchKnowledgeSchema.safeParse({
        action: "delete",
        ids,
      });
      expect(result.success).toBe(true);
    });

    it("非法 UUID → 报错", () => {
      const result = batchKnowledgeSchema.safeParse({
        action: "publish",
        ids: ["not-a-valid-uuid"],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("UUID");
      }
    });
  });

  it("非法 action → 报错", () => {
    const result = batchKnowledgeSchema.safeParse({
      action: "badAction",
      ids: [VALID_UUID],
    });
    expect(result.success).toBe(false);
  });
});
