### 判定: PASS

## 审查文件
`lib/validations/script.ts`

## 对照 README §3.1 数据模型检查

**字段覆盖**
- `title` VARCHAR(200) → `titleSchema` max(200) ✅
- `customer_question` TEXT（生成接口限 500）→ `customerQuestionSchema` max(2000) 用于存储校验，`GENERATE_QUESTION_MAX_LENGTH=500` 专用于生成接口 ✅
- `answer` TEXT → `answerSchema` max(10000) ✅
- `question_aliases` JSONB 数组 → `questionAliasSchema` + array max(10) ✅
- `source` enum curated/from_knowledge/ai_submitted → 直接从 `scriptSources` 派生 ✅
- `status` enum 5 值 → 创建时限制 draft/published（正确，其余状态走状态机） ✅
- `knowledge_id` UUID nullable optional → ✅
- `submission_request_id` UUID → `submitScriptSchema` 的 `requestId` 字段 ✅
- `reject_reason` TEXT → `reviewScriptSchema` 的 `rejectReason` max(500) ✅

**enum 一致性**
- `scriptStatuses` / `scriptSources` 从 schema 常量派生，单一来源原则已满足，无硬编码。

**preprocess 安全性**
- 无使用 `z.preprocess`（该文件），无安全风险。

**listScriptsQuerySchema 细节**
- `sceneTagIds` / `productTagIds` 使用 `z.array(z.string().uuid())` 但未处理查询字符串数组的传入格式（URL 查询串通常是 `?sceneTagIds[]=xxx` 或逗号分隔字符串）。不同 Next.js 解析方式下可能出现字符串而非数组，导致 zod 校验失败。
  - **级别**：MEDIUM（不影响安全，影响使用体验；由路由层负责解析时可消解）

**updateScriptSchema refine 逻辑**
- `refine((data) => Object.keys(data).length > 0)` 在 zod 中 `.optional()` 字段若未传入，`Object.keys` 仍可能返回空对象（所有键都 undefined 但实际存在）。应使用 `Object.values(data).some(v => v !== undefined)` 更准确。
  - **级别**：LOW（当前行为 zod 对 optional 不传值时不会将 key 放入 parse 结果，逻辑功能正确，但理解上有歧义）

## 总结

| 级别 | 数量 |
|------|------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 1 |
| LOW | 1 |

整体实现规范，与 README 数据模型对齐良好，单一来源原则执行到位。
