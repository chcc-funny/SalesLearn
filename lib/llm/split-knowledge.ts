import { db } from "@/lib/db";
import { knowledgeBase } from "@/lib/db/schema";
import { chatCompletionJSON, LLM_MODELS, type ModelId } from "./openrouter";
import { updateTask } from "./tasks";

interface ProcessFileParams {
  taskId: string;
  fileUrl: string;
  fileName: string;
  fileContent: string;
  tenantId: string;
  createdBy: string;
  category?: string;
  model?: ModelId;
}

interface SplitKnowledgeItem {
  title: string;
  category: string;
  key_points: string[];
  content: string;
  examples: string;
  common_mistakes: string;
}

interface SplitResult {
  knowledge_points: SplitKnowledgeItem[];
}

const SPLIT_SYSTEM_PROMPT = `你是一个专业的销售培训知识拆解专家，专注于汽车美容行业。
你的任务是将上传的培训资料拆解为独立的知识点卡片。

每个知识点必须包含以下字段：
- title: 知识点标题（简洁明了，不超过30字）
- category: 分类，只能是以下之一：product（产品知识）、objection（客户异议处理）、closing（成交话术）、psychology（客户心理）
- key_points: 核心要点数组（3-5个要点，每个要点一句话）
- content: 详细说明（200-500字，通俗易懂）
- examples: 案例或话术示例（包含客户问和销售回答的对话格式）
- common_mistakes: 常见误区（2-3个新手容易犯的错误）

要求：
1. 每个知识点必须独立完整，可以单独学习
2. 语言通俗易懂，面向一线销售人员
3. 要点提炼精准，便于记忆
4. 案例贴近实际销售场景
5. 如果原文内容不足以拆分多个知识点，至少输出1个

输出严格的 JSON 格式：
{
  "knowledge_points": [
    {
      "title": "...",
      "category": "product|objection|closing|psychology",
      "key_points": ["...", "..."],
      "content": "...",
      "examples": "...",
      "common_mistakes": "..."
    }
  ]
}`;

function buildUserPrompt(
  fileContent: string,
  fileName: string,
  category?: string
): string {
  const categoryHint = category
    ? `\n用户预设的分类为：${category}，请优先使用此分类，但如果内容明显属于其他分类也可以调整。`
    : "";

  return `请将以下培训资料拆解为独立的知识点卡片。${categoryHint}

文件名：${fileName}

--- 文件内容开始 ---
${fileContent.slice(0, 15000)}
--- 文件内容结束 ---

请输出 JSON 格式的知识点数组。`;
}

/**
 * 异步处理文件：调用 AI 切分知识点并写入数据库
 */
export async function processFileWithAI(
  params: ProcessFileParams
): Promise<void> {
  const { taskId, fileContent, fileName, tenantId, createdBy, fileUrl, category, model } =
    params;

  try {
    // 1. 调用 LLM 切分知识点
    const { data } = await chatCompletionJSON<SplitResult>({
      model: model ?? LLM_MODELS.KIMI_K2,
      messages: [
        { role: "system", content: SPLIT_SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(fileContent, fileName, category) },
      ],
      temperature: 0.3,
      maxTokens: 8192,
    });

    const points = data.knowledge_points;

    if (!Array.isArray(points) || points.length === 0) {
      throw new Error("AI 未能从文件中提取到知识点");
    }

    // 2. 批量写入数据库
    const validCategories = ["product", "objection", "closing", "psychology"];

    const rows = points.map((p) => ({
      tenantId,
      title: String(p.title).slice(0, 200),
      category: validCategories.includes(p.category)
        ? p.category
        : category ?? "product",
      keyPoints: Array.isArray(p.key_points) ? p.key_points : [],
      content: String(p.content),
      examples: p.examples ? String(p.examples) : null,
      commonMistakes: p.common_mistakes ? String(p.common_mistakes) : null,
      status: "reviewing" as const,
      sourceFileUrl: fileUrl,
      createdBy,
    }));

    const inserted = await db
      .insert(knowledgeBase)
      .values(rows)
      .returning({ id: knowledgeBase.id });

    const knowledgeIds = inserted.map((r) => r.id);

    // 3. 标记任务完成
    updateTask(taskId, {
      status: "completed",
      knowledgeIds,
      completedAt: new Date(),
    });
  } catch (err) {
    updateTask(taskId, {
      status: "failed",
      error: err instanceof Error ? err.message : "AI 切分处理失败",
      completedAt: new Date(),
    });
    throw err;
  }
}
