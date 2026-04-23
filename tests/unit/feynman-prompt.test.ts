import { describe, it, expect } from "vitest";
import {
  calculateTotalScore,
  canUnlockStageB,
  buildFeynmanUserPrompt,
} from "@/lib/llm/feynman-prompt";

describe("calculateTotalScore", () => {
  it("校准示例: {80,80,85,75} → 80", () => {
    const result = calculateTotalScore({
      completeness: 80,
      accuracy: 80,
      clarity: 85,
      analogy: 75,
    });
    expect(result).toBe(80);
  });

  it("全零 → 0", () => {
    const result = calculateTotalScore({
      completeness: 0,
      accuracy: 0,
      clarity: 0,
      analogy: 0,
    });
    expect(result).toBe(0);
  });

  it("全满分 → 100", () => {
    const result = calculateTotalScore({
      completeness: 100,
      accuracy: 100,
      clarity: 100,
      analogy: 100,
    });
    expect(result).toBe(100);
  });

  it("{91,83,77,69} → 81", () => {
    // 91*0.3 + 83*0.3 + 77*0.2 + 69*0.2 = 27.3 + 24.9 + 15.4 + 13.8 = 81.4 → round → 81
    const result = calculateTotalScore({
      completeness: 91,
      accuracy: 83,
      clarity: 77,
      analogy: 69,
    });
    expect(result).toBe(81);
  });

  it("{80,75,85,80} → round(79.5) = 80", () => {
    // 80*0.3 + 75*0.3 + 85*0.2 + 80*0.2 = 24 + 22.5 + 17 + 16 = 79.5 → round → 80
    const result = calculateTotalScore({
      completeness: 80,
      accuracy: 75,
      clarity: 85,
      analogy: 80,
    });
    expect(result).toBe(80);
  });
});

describe("canUnlockStageB", () => {
  it("80 → true", () => {
    expect(canUnlockStageB(80)).toBe(true);
  });

  it("79 → false", () => {
    expect(canUnlockStageB(79)).toBe(false);
  });

  it("100 → true", () => {
    expect(canUnlockStageB(100)).toBe(true);
  });

  it("0 → false", () => {
    expect(canUnlockStageB(0)).toBe(false);
  });
});

describe("buildFeynmanUserPrompt", () => {
  const baseParams = {
    title: "隔热膜介绍",
    keyPoints: ["隔热率高", "防紫外线", "质保五年"],
    content: "量子膜隔热膜是高性能产品...",
    transcript: "这个膜隔热效果很好...",
  };

  it("基本输出包含 title、numbered keyPoints、content、transcript", () => {
    const result = buildFeynmanUserPrompt(baseParams);
    expect(result).toContain("隔热膜介绍");
    expect(result).toContain("1. 隔热率高");
    expect(result).toContain("2. 防紫外线");
    expect(result).toContain("3. 质保五年");
    expect(result).toContain("量子膜隔热膜是高性能产品...");
    expect(result).toContain("这个膜隔热效果很好...");
  });

  it("有 examples 时包含'参考话术'", () => {
    const result = buildFeynmanUserPrompt({
      ...baseParams,
      examples: "您可以这样跟客户说...",
    });
    expect(result).toContain("参考话术");
    expect(result).toContain("您可以这样跟客户说...");
  });

  it("有 commonMistakes 时包含'常见误区'", () => {
    const result = buildFeynmanUserPrompt({
      ...baseParams,
      commonMistakes: "不要把隔热率和透光率搞混",
    });
    expect(result).toContain("常见误区");
    expect(result).toContain("不要把隔热率和透光率搞混");
  });

  it("无 optional 字段时不包含参考话术和常见误区", () => {
    const result = buildFeynmanUserPrompt(baseParams);
    expect(result).not.toContain("参考话术");
    expect(result).not.toContain("常见误区");
  });
});
