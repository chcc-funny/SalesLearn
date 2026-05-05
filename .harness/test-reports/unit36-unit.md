### 判定: PASS

## unit36 - tests/unit/scripts-prompt-templates.test.ts

### 测试结果
- 测试文件: 1 passed
- 测试用例: 通过（全部 52 个用例中 unit36 部分全部通过）
- 全量回归: 71 files / 947 passed (1 skipped) - 0 失败

### 覆盖率（lib/services/scripts/prompt-templates.ts）
| 指标 | 数值 | 阈值 | 状态 |
|---|---|---|---|
| Statements | 100% | ≥80% | PASS |
| Branches | 69.23% | - | - |
| Functions | 100% | - | - |
| Lines | 100% | ≥80% | PASS |

未覆盖行: 部分常量分支（行 ...82,142,149-204 — 主要为 critic prompt 的可选分支）

### 关键校验点
- buildScriptGenerationPrompt: 角色定义、user_input 包裹、注入防御、knowledge_chunk 包裹与 id 透传、标签透传、空标签/空切片兜底、长度截断（MAX_USER_INPUT_LENGTH / MAX_KNOWLEDGE_CHUNK_LENGTH）、JSON 输出要求、HTML 转义防伪造关闭标签
- buildScriptRerankPrompt: candidate 包裹、id 透传、scene/product 透传、空候选兜底、JSON 评分要求、注入防御、长度截断
- buildScriptCriticPrompt: 占位实现，包含话术内容
- 常量导出: MAX_USER_INPUT_LENGTH ≥200、MAX_KNOWLEDGE_CHUNK_LENGTH ≥500

### 结论
unit36 PASS。覆盖率 100% (statements/lines)，超过 80% 阈值。
