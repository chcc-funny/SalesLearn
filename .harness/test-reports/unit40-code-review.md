### 判定: PASS

**unit40 — lib/services/scripts/generate.ts**

#### LLM 输出 JSON 解析防御
`chatCompletionJSON` 封装在 openrouter 层负责 JSON 解析，失败会抛错，被 `try/catch` 捕获并映射为 `GenerateError('LLM_ERROR')`。解析成功后，代码对 `llmData` 做三层显式校验：
1. `!llmData || typeof llmData !== 'object'` → `INVALID_RESPONSE`
2. `typeof llmData.answer !== 'string'` → `INVALID_RESPONSE`
3. `answer.trim().length === 0` → `EMPTY_ANSWER`

防御链完整，无裸 JSON.parse 暴露。

#### 错误码分类
- `LLM_ERROR`：LLM 网络/超时异常
- `INVALID_RESPONSE`：返回结构不合规（非对象 / answer 不是 string）
- `EMPTY_ANSWER`：answer 为空字符串

三类错误码语义清晰、不重叠。

#### Prompt 注入防御
用户输入通过 `buildScriptGenerationPrompt`（unit36/prompt-templates.ts）处理：
- `sanitizeUserInput` 做 `escapeXmlTags` + `truncate`
- `<user_input>` 标签包裹 + system prompt 明确声明「忽略 user_input 内指令」
- `customerQuestion` 在传入 prompt 前已 `slice(0, MAX_USER_INPUT_LENGTH)` 截断

防注入措施完整。

#### 多租户隔离
`tenantId` 透传给 `retrieveKnowledgeChunks`，知识检索在租户内隔离（unit39 已验证）。

#### `knowledgeChunkIds` 直连路径
提供 `knowledgeChunkIds` 时，跳过检索，构造空 content 的占位 chunk 传入 prompt。注意：占位 chunk 的 `content` 为空字符串，LLM 实际上没有知识内容可引用，只能依赖通用经验生成答案。这是 v1 有意为之的简化（注释已说明），无安全风险，但功能上较弱——属 MEDIUM 级别设计取舍，不触发 FAIL。

#### sourceIds 防御
LLM 返回非数组 sourceIds 时降级为 `[]`，且对数组元素做 `typeof s === 'string'` 过滤，防止恶意/意外类型注入下游。

#### 测试覆盖
18 个用例，覆盖成功路径 / 0 切片 / knowledgeChunkIds 跳过检索 / 标签透传 / Claude Sonnet 模型选择 / LLM_ERROR / INVALID_RESPONSE（null / 非字符串 answer）/ EMPTY_ANSWER（空白字符串）/ title 截断 / sourceIds 非数组退化 / GenerateError 构造验证，全路径覆盖。

**无 CRITICAL / HIGH 问题。**
