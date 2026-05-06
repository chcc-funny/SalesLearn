import { describe, it, expect } from "vitest";
import {
  QUIZ_SYSTEM_PROMPT,
  QUIZ_FEW_SHOT,
  buildQuizUserPrompt,
} from "@/lib/llm/quiz-prompt";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

describe("QUIZ_SYSTEM_PROMPT", () => {
  it("包含四种题型说明", () => {
    expect(QUIZ_SYSTEM_PROMPT).toContain("memory");
    expect(QUIZ_SYSTEM_PROMPT).toContain("understanding");
    expect(QUIZ_SYSTEM_PROMPT).toContain("application");
    expect(QUIZ_SYSTEM_PROMPT).toContain("analysis");
  });

  it("要求输出 JSON 格式", () => {
    expect(QUIZ_SYSTEM_PROMPT).toContain("JSON");
    expect(QUIZ_SYSTEM_PROMPT).toContain("questions");
  });
});

describe("QUIZ_FEW_SHOT", () => {
  it("包含示例输入和示例输出", () => {
    expect(QUIZ_FEW_SHOT).toContain("示例输入");
    expect(QUIZ_FEW_SHOT).toContain("示例输出");
  });
});

// ─────────────────────────────────────────────────────────────
// buildQuizUserPrompt
// ─────────────────────────────────────────────────────────────

describe("buildQuizUserPrompt", () => {
  const baseParams = {
    title: "PPF 漆面保护膜",
    keyPoints: ["TPU 材质", "自修复", "5-10 年寿命"],
    content: "PPF 是一种高性能保护薄膜...",
    commonMistakes: null,
    count: 3,
    types: ["memory", "understanding", "application"],
  };

  it("包含知识点标题、数量和题型", () => {
    const result = buildQuizUserPrompt(baseParams);
    expect(result).toContain("PPF 漆面保护膜");
    expect(result).toContain("3 道测试题");
    expect(result).toContain("memory");
  });

  it("核心要点带序号编排", () => {
    const result = buildQuizUserPrompt(baseParams);
    expect(result).toContain("1. TPU 材质");
    expect(result).toContain("2. 自修复");
    expect(result).toContain("3. 5-10 年寿命");
  });

  it("包含详细内容（截取前 5000 字）", () => {
    const result = buildQuizUserPrompt(baseParams);
    expect(result).toContain("PPF 是一种高性能保护薄膜...");
  });

  it("commonMistakes 为 null 时不输出误区区块", () => {
    const result = buildQuizUserPrompt({ ...baseParams, commonMistakes: null });
    expect(result).not.toContain("常见误区");
  });

  it("commonMistakes 有值时包含误区内容", () => {
    const result = buildQuizUserPrompt({
      ...baseParams,
      commonMistakes: "不要混淆 PVC 和 TPU",
    });
    expect(result).toContain("常见误区");
    expect(result).toContain("不要混淆 PVC 和 TPU");
  });

  it("content 超过 5000 字时自动截断", () => {
    const longContent = "x".repeat(6000);
    const result = buildQuizUserPrompt({ ...baseParams, content: longContent });
    // The prompt should contain exactly 5000 x-chars
    const xCount = (result.match(/x/g) ?? []).length;
    expect(xCount).toBe(5000);
  });
});
