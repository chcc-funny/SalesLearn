export const QUIZ_SYSTEM_PROMPT = `你是一个销售培训测试题出题专家，专注于汽车美容行业。
你的任务是根据给定的知识点内容，生成高质量的四选一单选题。

题型说明：
- memory（记忆题）：考察事实性知识点的直接记忆，如参数、名称、特性
- understanding（理解题）：考察对原理、逻辑的理解，需要解释"为什么"
- application（应用题）：考察在具体销售场景中如何运用知识
- analysis（分析题）：考察对复杂情境的综合分析和判断

要求：
1. 每题有且仅有 4 个选项（A/B/C/D）
2. 正确答案只有一个
3. 干扰项要有一定迷惑性（来源于常见误区）
4. 每个选项都要有对应解析
5. 题目语言通俗，面向一线销售人员
6. 选项长度适中，避免过长

输出严格的 JSON 格式：
{
  "questions": [
    {
      "type": "memory|understanding|application|analysis",
      "question_text": "题干内容",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correct_answer": "A|B|C|D",
      "explanations": {
        "A": "选项A的解析",
        "B": "选项B的解析",
        "C": "选项C的解析",
        "D": "选项D的解析"
      }
    }
  ]
}`;

export const QUIZ_FEW_SHOT = `示例输入：
知识点：PPF 漆面保护膜产品知识
要点：TPU 材质、自修复功能、5-10年使用寿命

示例输出：
{
  "questions": [
    {
      "type": "memory",
      "question_text": "优质 PPF 的主要材质是什么？",
      "options": ["PVC", "TPU", "PE", "PP"],
      "correct_answer": "B",
      "explanations": {
        "A": "PVC 是较早期的材质，硬度高但不具备自修复功能",
        "B": "正确！TPU（热塑性聚氨酯）是优质 PPF 的主要材质",
        "C": "PE 是普通塑料，不适合用作漆面保护膜",
        "D": "PP 主要用于包装材料，不具备所需柔韧性"
      }
    }
  ]
}`;

export function buildQuizUserPrompt(params: {
  title: string;
  keyPoints: string[];
  content: string;
  commonMistakes: string | null;
  count: number;
  types: string[];
}): string {
  const { title, keyPoints, content, commonMistakes, count, types } = params;
  const typesStr = types.join("、");

  return `请根据以下知识点生成 ${count} 道测试题。
题型要求：${typesStr}（请均匀分配题型）。

知识点标题：${title}
核心要点：
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

详细内容：
${content.slice(0, 5000)}

${commonMistakes ? `常见误区（可用于干扰项设计）：\n${commonMistakes}` : ""}

请输出 JSON 格式的题目数组。`;
}
