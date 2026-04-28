import { describe, it, expect } from "vitest";
import { createKnowledgeSchema, updateKnowledgeSchema } from "@/lib/validations/knowledge";

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
});
