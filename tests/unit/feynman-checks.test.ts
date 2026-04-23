import { describe, it, expect } from "vitest";
import { checkTranscript } from "@/lib/validations/feynman-checks";

describe("checkTranscript", () => {
  const defaultKeyPoints = ["隔热率高", "防紫外线", "质保五年"];

  it("空字符串 → blank", () => {
    const result = checkTranscript("", defaultKeyPoints);
    expect(result).toEqual(
      expect.objectContaining({ valid: false, code: "blank" })
    );
  });

  it("纯空格 → blank", () => {
    const result = checkTranscript("   ", defaultKeyPoints);
    expect(result).toEqual(
      expect.objectContaining({ valid: false, code: "blank" })
    );
  });

  it("少于20字符的中文 → too_short", () => {
    const result = checkTranscript("隔热膜很好用", defaultKeyPoints);
    expect(result).toEqual(
      expect.objectContaining({ valid: false, code: "too_short" })
    );
  });

  it("超过5000字符 → too_long", () => {
    const longText = "隔热膜产品介绍内容".repeat(700); // 6300 chars
    const result = checkTranscript(longText, defaultKeyPoints);
    expect(result).toEqual(
      expect.objectContaining({ valid: false, code: "too_long" })
    );
  });

  it("重复单字符 → gibberish", () => {
    const result = checkTranscript("啊".repeat(100), defaultKeyPoints);
    expect(result).toEqual(
      expect.objectContaining({ valid: false, code: "gibberish" })
    );
  });

  it("与keyPoints无重叠的足够长文本 → off_topic", () => {
    const offTopicText =
      "今天天气真不错，我们去公园散步吧，顺便买点水果回来做沙拉，晚上再看个电影放松一下心情";
    const result = checkTranscript(offTopicText, defaultKeyPoints);
    expect(result).toEqual(
      expect.objectContaining({ valid: false, code: "off_topic" })
    );
  });

  it("正常中文含关键词 → ok", () => {
    const validText =
      "这款隔热膜的隔热率高达百分之九十五，同时还能防紫外线，保护车内人员和内饰，而且还有质保五年的服务承诺";
    const result = checkTranscript(validText, defaultKeyPoints);
    expect(result).toEqual(
      expect.objectContaining({ valid: true, code: "ok" })
    );
  });

  it("空keyPoints数组 → 跳过off_topic检查，应pass", () => {
    const text =
      "今天天气真不错，我们去公园散步吧，顺便买点水果回来做沙拉，晚上再看个电影放松一下心情";
    const result = checkTranscript(text, []);
    expect(result).toEqual(
      expect.objectContaining({ valid: true, code: "ok" })
    );
  });
});
