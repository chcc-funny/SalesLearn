import { describe, it, expect } from "vitest";
import {
  PERSONA_PROMPTS,
  buildChatSystemPrompt,
  buildChatUserPrompt,
  parseChatMetadata,
  type PersonaType,
  type KnowledgeContext,
} from "@/lib/llm/feynman-chat-prompt";

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const knowledge: KnowledgeContext = {
  title: "隔热膜基础知识",
  content: "隔热膜能有效降低车内温度，阻挡紫外线...",
  keyPoints: ["高隔热率", "防紫外线", "质保五年"],
};

// ─────────────────────────────────────────────────────────────
// PERSONA_PROMPTS
// ─────────────────────────────────────────────────────────────

describe("PERSONA_PROMPTS", () => {
  it("包含三种人设：beginner / bargainer / expert", () => {
    const keys = Object.keys(PERSONA_PROMPTS) as PersonaType[];
    expect(keys).toContain("beginner");
    expect(keys).toContain("bargainer");
    expect(keys).toContain("expert");
  });

  it("每种人设 prompt 字符数大于 100（有实质内容）", () => {
    for (const persona of Object.keys(PERSONA_PROMPTS) as PersonaType[]) {
      expect(PERSONA_PROMPTS[persona].length).toBeGreaterThan(100);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// buildChatSystemPrompt
// ─────────────────────────────────────────────────────────────

describe("buildChatSystemPrompt", () => {
  it("包含人设 prompt 内容", () => {
    const result = buildChatSystemPrompt("beginner", knowledge);
    expect(result).toContain(PERSONA_PROMPTS.beginner);
  });

  it("包含知识点标题和内容", () => {
    const result = buildChatSystemPrompt("bargainer", knowledge);
    expect(result).toContain("隔热膜基础知识");
    expect(result).toContain("隔热膜能有效降低车内温度");
  });

  it("keyPoints 带序号编排", () => {
    const result = buildChatSystemPrompt("expert", knowledge);
    expect(result).toContain("1. 高隔热率");
    expect(result).toContain("2. 防紫外线");
    expect(result).toContain("3. 质保五年");
  });

  it("有 examples 时包含参考话术", () => {
    const result = buildChatSystemPrompt("beginner", {
      ...knowledge,
      examples: "客户问：有啥用？销售答：隔热防晒。",
    });
    expect(result).toContain("参考话术");
    expect(result).toContain("客户问：有啥用？");
  });

  it("有 commonMistakes 时包含常见误区", () => {
    const result = buildChatSystemPrompt("beginner", {
      ...knowledge,
      commonMistakes: "不要混淆隔热率和透光率",
    });
    expect(result).toContain("常见误区");
    expect(result).toContain("不要混淆隔热率和透光率");
  });

  it("无 optional 字段时不包含参考话术/误区", () => {
    const result = buildChatSystemPrompt("expert", knowledge);
    expect(result).not.toContain("参考话术");
    expect(result).not.toContain("常见误区");
  });

  it("包含 META 输出格式说明", () => {
    const result = buildChatSystemPrompt("beginner", knowledge);
    expect(result).toContain("META");
    expect(result).toContain("isConvinced");
  });
});

// ─────────────────────────────────────────────────────────────
// buildChatUserPrompt
// ─────────────────────────────────────────────────────────────

describe("buildChatUserPrompt", () => {
  it("在员工回复前添加标签", () => {
    const result = buildChatUserPrompt("这个膜真的能隔热吗？");
    expect(result).toBe("[员工回复] 这个膜真的能隔热吗？");
  });

  it("空字符串也正常包装", () => {
    const result = buildChatUserPrompt("");
    expect(result).toBe("[员工回复] ");
  });
});

// ─────────────────────────────────────────────────────────────
// parseChatMetadata
// ─────────────────────────────────────────────────────────────

describe("parseChatMetadata", () => {
  it("正常解析 META 标记，分离显示文本和元数据", () => {
    const aiResponse =
      '嗯，听起来不错。<!--META:{"isConvinced":false,"roundNumber":2,"isComplete":false}-->';
    const result = parseChatMetadata(aiResponse);

    expect(result.displayText).toBe("嗯，听起来不错。");
    expect(result.metadata.isConvinced).toBe(false);
    expect(result.metadata.roundNumber).toBe(2);
    expect(result.metadata.isComplete).toBe(false);
  });

  it("isComplete=true 时包含 evalSummary", () => {
    const aiResponse =
      '好的，我被说服了。<!--META:{"isConvinced":true,"roundNumber":3,"isComplete":true,"evalSummary":"表现不错"}-->';
    const result = parseChatMetadata(aiResponse);

    expect(result.metadata.isConvinced).toBe(true);
    expect(result.metadata.isComplete).toBe(true);
    expect(result.metadata.evalSummary).toBe("表现不错");
  });

  it("无 META 标记时返回默认元数据", () => {
    const result = parseChatMetadata("这是普通回复，没有 META。");
    expect(result.displayText).toBe("这是普通回复，没有 META。");
    expect(result.metadata.isConvinced).toBe(false);
    expect(result.metadata.roundNumber).toBe(1);
    expect(result.metadata.isComplete).toBe(false);
  });

  it("META JSON 解析失败时回退到默认元数据", () => {
    const result = parseChatMetadata("回复<!--META:{ invalid json }-->");
    expect(result.metadata.isConvinced).toBe(false);
    expect(result.metadata.roundNumber).toBe(1);
  });

  it("displayText 去除首尾空白", () => {
    const result = parseChatMetadata(
      '  你好  <!--META:{"isConvinced":false,"roundNumber":1,"isComplete":false}-->  '
    );
    expect(result.displayText).toBe("你好");
  });
});
