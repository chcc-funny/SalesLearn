### 判定: PASS

**unit41 — lib/services/scripts/orchestrator.ts**

#### 阈值差异分析：数量 ≥ 3 vs 分数 ≥ 0.8
README §8 写「最高分 ≥ 0.8 → 命中」（分数阈值），orchestrator v1 改为「候选数量 ≥ 3 → 走 curated」（数量阈值）。
lessons-learned.md 已记录此决策，理由是：3 条候选已足够 LLM rerank 从中选出 top-3，无需额外分数过滤；Phase 3 可补充 `reranked.items[0].score >= 0.8` 二次判定。
设计取舍合理，文档已标注，不构成缺陷。

#### source 四态覆盖
| 状态 | 触发条件 |
|---|---|
| `curated` | 候选 ≥ 3（含 rerank 降级）；或候选 1-2 且 generate 失败 |
| `generated` | 候选 = 0 且 generate 成功 |
| `mixed` | 候选 1-2 且 generate 成功 |
| `empty` | 候选 = 0 且 generate 失败；或空 query 短路 |

四态完整，无漏洞。

#### 混合模式合并去重
`mixed` 路径将原候选 + 生成 draft 直接 concat，候选来自 `searchScriptCandidates` SQL（WHERE 唯一约束），生成 draft id 固定为 `"generated:0"`，与任何 DB id 不冲突。代码注释也明确「候选已由 SQL where 唯一」，不需额外去重逻辑。合理。

#### 失败传播策略
- `rerankScripts` 失败：目前代码不捕获 rerank 异常，会向上传播给路由层。对应 lessons-learned 记录的「rerank 降级」是指 rerank 内部 LLM 超时后自行降级并返回 `degraded=true`，不是 orchestrator 层 catch。若 rerank 本身抛出未处理异常，orchestrator 无 fallback 直接报 500。这是一个 **MEDIUM** 级别的遗漏：rerank 本体（unit38）已做内部降级，但 orchestrator 无二次保护网。整体可容忍，不触发 FAIL。
- `generateScriptFromKnowledge` 失败：有完整 try/catch，失败后按候选数量退化到 `curated` 或 `empty`，不抛错。

#### 多租户隔离
`tenantId` 透传给 `searchScriptCandidates`（search 层隔离）和 `generateScriptFromKnowledge`（进而透传给 retrieveKnowledgeChunks）。三层全部携带 tenantId，隔离完整。

#### 测试覆盖
13 个用例，覆盖：
- 候选 ≥ 3 → curated，rerank top-3 截取
- 候选恰好 = 3 边界
- rerank 降级（degraded=true）透传
- 候选 = 2 → mixed（generate 成功）
- 候选 = 1 → mixed
- 候选 = 0 → generated
- 候选 = 0 + generate 失败 → empty
- 候选 = 2 + generate 失败 → curated + generateError
- 参数透传到 search / generate
- 跨租户独立调用
- 空 query 短路
- 纯空白 query 短路

四态全路径 + 降级路径 + 边界覆盖完整。

#### 轻微问题（不触发 FAIL）
- `rerank` 调用缺乏外层 try/catch（MEDIUM）：建议 Phase 2 在 orchestrator 层对 `rerankScripts` 也加保护，当 rerank 完全崩溃时降级为「原始候选按 search score 排序」，而非直接 500。
- `mixed` 模式下生成 draft 始终排在候选之后（score=0），UX 层可能需要按 score 二次排序，但这属于 API 层 / 前端职责，不是 orchestrator 的问题。

**无 CRITICAL / HIGH 问题。**
