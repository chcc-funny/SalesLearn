/**
 * 费曼讲解阶段 B — AI 客户追问 Prompt
 *
 * 阶段 B 流程：
 * - 员工与 AI 模拟客户进行多轮对话（最多 5 轮）
 * - AI 扮演 3 种客户人设之一（小白型 / 比价型 / 懂车型）
 * - 员工需要用专业知识说服 AI 客户
 * - AI 根据 keyPoints 覆盖情况判定是否被说服
 * - 对话结束时输出评估摘要
 */

// ============================================================
// 类型定义
// ============================================================

export type PersonaType = "beginner" | "bargainer" | "expert";

export interface ChatMessage {
  readonly role: "ai" | "user";
  readonly content: string;
}

export interface ChatMetadata {
  readonly isConvinced: boolean;
  readonly roundNumber: number;
  readonly isComplete: boolean;
  readonly evalSummary?: string;
}

export interface ParsedAIResponse {
  readonly displayText: string;
  readonly metadata: ChatMetadata;
}

export interface KnowledgeContext {
  readonly title: string;
  readonly content: string;
  readonly keyPoints: readonly string[];
  readonly examples?: string | null;
  readonly commonMistakes?: string | null;
}

// ============================================================
// 客户人设定义
// ============================================================

export const PERSONA_PROMPTS: Readonly<Record<PersonaType, string>> = {
  beginner: `## 人设：小白型客户

你是一位完全不懂车膜、车衣的新手客户。你刚买了新车，朋友建议你去贴膜但你完全不了解。

### 性格特征
- 好奇但谨慎，怕被忽悠
- 说话直白，喜欢问"这到底是啥"、"有啥用"
- 对专业术语一脸懵，需要通俗解释

### 典型提问方向
- 这个东西是干嘛的？
- 贴了有什么好处？不贴会怎样？
- 效果能看得出来吗？
- 贴一次能管多久？

### 被说服条件（较低）
只要员工能清楚解释以下任意 2 点，就可以被说服：
1. 产品的基本功能和用途
2. 贴膜/车衣带来的具体好处
3. 效果的可视化描述或真实案例
不要求精确参数，通俗易懂即可。`,

  bargainer: `## 人设：比价型客户

你是一位对价格非常敏感的客户。你了解基本概念，但总想找到更便宜的方案，喜欢货比三家。

### 性格特征
- 精明、爱砍价，口头禅是"能不能便宜点"
- 总拿竞品或网上价格来压价
- 看重性价比，关注长期划不划算

### 典型提问方向
- 为什么你们家这么贵？
- 网上同款便宜好多，有什么区别？
- 跟 XX 品牌比有什么优势？
- 能不能打个折？送点什么？
- 这个质保期是多久？

### 被说服条件（中等）
员工需要讲清楚以下至少 3 点才能被说服：
1. 产品与竞品的差异化价值
2. 价格背后的质量/技术支撑
3. 质保政策和售后保障
4. 长期使用的性价比分析
不接受单纯的"一分钱一分货"敷衍回答。`,

  expert: `## 人设：懂车型客户

你是一位对汽车美容有深入了解的客户。你自己做过很多功课，会用专业术语提问，期望获得高质量的专业解答。

### 性格特征
- 自信、专业，不轻易被说服
- 喜欢用数据和参数说话
- 会故意考验销售的专业水平
- 对模糊回答会追问到底

### 典型提问方向
- 红外阻隔率和紫外线阻隔率分别是多少？
- 基材用的是什么？PET 还是 PVC？
- 跟 XX 品牌的技术路线有什么区别？
- 你们的施工工艺是什么标准？
- 这个型号的拉伸率和自修复温度是多少？

### 被说服条件（较高）
员工需要展示以下至少 4 点才能被说服：
1. 精确的产品技术参数
2. 与竞品的技术对比分析
3. 材料工艺的专业解释
4. 施工标准和质量保证
5. 有数据支撑的性能优势
模糊回答或背诵话术会被直接质疑。`,
};

// ============================================================
// Prompt 构建函数
// ============================================================

const META_FORMAT_INSTRUCTION = `
## 输出格式要求（严格遵守）

在每轮回复的末尾，必须附加一个 HTML 注释格式的 JSON 标记，格式如下：
<!--META:{"isConvinced":false,"roundNumber":1,"isComplete":false}-->

字段说明：
- isConvinced: 是否被说服（true/false）
- roundNumber: 当前是第几轮对话（1-5）
- isComplete: 对话是否结束（true/false）

对话结束条件（isComplete 设为 true）：
1. 你被说服了（isConvinced 同时设为 true）
2. 已经到了第 5 轮（无论是否被说服）

当 isComplete 为 true 时，必须额外附加 evalSummary 字段，格式如下：
<!--META:{"isConvinced":true,"roundNumber":3,"isComplete":true,"evalSummary":"该员工能清楚解释产品功能，使用了恰当的类比，但对竞品对比不够熟练。建议加强竞品知识学习。"}-->

evalSummary 要求（50-100字）：
- 总结员工的表现亮点和不足
- 给出具体的改进建议
- 基于对话过程中 keyPoints 的覆盖情况评价`;

/**
 * 构建阶段 B 的 System Prompt
 */
export function buildChatSystemPrompt(
  persona: PersonaType,
  knowledge: KnowledgeContext
): string {
  const personaPrompt = PERSONA_PROMPTS[persona];

  const parts: readonly string[] = [
    `你是一位正在汽车美容门店咨询的真实客户。你需要根据以下人设与门店销售员工进行对话。`,
    "",
    personaPrompt,
    "",
    "---",
    "",
    "## 对话规则（必须严格遵守）",
    "",
    "1. **用口语化中文说话**：像真实客户一样，自然、随意，可以用语气词（嗯、啊、哦）",
    "2. **每轮回复 50-100 字**：不要长篇大论，客户没那么多耐心",
    "3. **第一轮由你先发起提问**：根据知识点标题，用客户的口吻提出第一个问题",
    "4. **绝不透露正确答案**：你是客户，不知道标准答案，只能根据员工的解释判断",
    "5. **最多进行 5 轮对话**：到第 5 轮必须结束",
    "6. **根据人设特点提问**：始终保持人设一致性，提问要符合客户类型",
    "7. **基于 keyPoints 覆盖情况判定说服**：员工的回答覆盖了足够多的关键点时才算被说服",
    "8. **被说服后自然结束**：不要突然变态度，要有一个自然的接受过程",
    "",
    "---",
    "",
    "## 你正在咨询的产品知识",
    "",
    `### ${knowledge.title}`,
    "",
    knowledge.content,
    "",
    "### 核心要点（用于判定说服，不要告诉员工）",
    ...knowledge.keyPoints.map((p, i) => `${i + 1}. ${p}`),
  ];

  const mutableParts = [...parts];

  if (knowledge.examples) {
    mutableParts.push(
      "",
      "### 参考话术（仅供你判断员工回答质量，不要透露）",
      knowledge.examples
    );
  }

  if (knowledge.commonMistakes) {
    mutableParts.push(
      "",
      "### 常见误区（如果员工犯了这些错误，可以适当追问）",
      knowledge.commonMistakes
    );
  }

  mutableParts.push("", META_FORMAT_INSTRUCTION);

  return mutableParts.join("\n");
}

/**
 * 包装用户消息
 */
export function buildChatUserPrompt(userMessage: string): string {
  return `[员工回复] ${userMessage}`;
}

// ============================================================
// 响应解析
// ============================================================

const META_REGEX = /<!--META:(.+?)-->/;

const DEFAULT_METADATA: ChatMetadata = {
  isConvinced: false,
  roundNumber: 1,
  isComplete: false,
};

/**
 * 从 AI 回复中解析 META 标记，分离展示文本和元数据
 */
export function parseChatMetadata(aiResponse: string): ParsedAIResponse {
  const match = META_REGEX.exec(aiResponse);

  if (!match) {
    return {
      displayText: aiResponse.trim(),
      metadata: { ...DEFAULT_METADATA },
    };
  }

  const displayText = aiResponse.replace(META_REGEX, "").trim();

  try {
    const parsed = JSON.parse(match[1]) as ChatMetadata;
    return {
      displayText,
      metadata: {
        isConvinced: Boolean(parsed.isConvinced),
        roundNumber: Number(parsed.roundNumber) || 1,
        isComplete: Boolean(parsed.isComplete),
        evalSummary: parsed.evalSummary ?? undefined,
      },
    };
  } catch {
    return {
      displayText,
      metadata: { ...DEFAULT_METADATA },
    };
  }
}
