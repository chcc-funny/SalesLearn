### 判定: PASS

**审查范围**：`lib/services/scripts/repository.ts` + `tests/unit/scripts-repository.test.ts`

---

## 服务层（repository.ts）

### 安全 & 多租户隔离
- `listScripts`、`getScriptById`、`createScript`、`updateScript`、`patchScriptStatus`、`softDeleteScript`、`listScriptsByIds` 所有函数均显式 `WHERE tenant_id = ?`，无遗漏，通过。
- 软删路径额外附加 `isNull(scripts.deletedAt)` 防止已删记录被再次操作，设计严谨。

### SQL 注入防护
- 全部使用 Drizzle ORM 参数化表达式，唯一涉及动态字符串的是 ILIKE 查询。
- `listScripts:114` 对 `q` 进行了 `replace(/[\\%_]/g, ...)` 转义后放入模板字符串再传给 `sql` tagged template，Drizzle 的 `sql` tag 会将插值作为参数绑定，不存在注入风险。

### 事务边界
- `createScript`：insert scripts + insert script_tag_relations 在同一 `db.transaction()` 内，正确。
- `updateScript`：update scripts + delete relations + insert relations 均在同一事务内，正确。
- `patchScriptStatus`：**先读后写，两步分离，未使用事务**（`repository.ts:300-328`）。存在 TOCTOU（time-of-check-time-of-use）竞态：读到 status=draft → assertTransition → 另一请求并发写入 → 第一请求用旧 status 写入。

### 状态机调用
- `patchScriptStatus` 先读当前 status，调用 `assertTransition(from, to)` 校验，非法时抛 `ScriptStateTransitionError`，正确。
- `archiveScript` 复用 `patchScriptStatus`，间接经过状态机校验，正确。

### 错误处理
- `createScript` 在 returning 空时正确抛错；`updateScript` 找不到记录返回 null，区分清晰。
- `getScriptById` 的 `scriptTagRelations` 查询**未过滤 `tenantId`**（`repository.ts:172`）：仅 `WHERE scriptId = id`，依赖上层已通过 tenantId 确认 script 归属当前租户。若 scriptId 被猜到（UUID 空间极大），因已有第一步 script 行的 tenantId 校验兜底，实际风险极低，但防御性更严格的做法是 join 时也带 tenantId。

---

## 测试层（scripts-repository.test.ts）

### Mock 设计
- 使用 `vi.hoisted` 维护完整链式 mock（含 `transaction`、`delete`），并将 tx 透传为同一 mock db，使事务内调用可被统一断言，设计合理。
- `beforeEach` + `wireChain()` 保证用例间隔离。

### 关键路径覆盖
- `patchScriptStatus`：合法跳转、非法跳转（`ScriptStateTransitionError`）、记录不存在三条分支均有覆盖，优秀。
- `archiveScript`：published→archived（合法）和 draft→archived（状态机拒绝）均有覆盖。
- `updateScript`：无标签更新 + 有标签重写（delete+insert）+ 记录不存在三条路径覆盖完整。

---

## HIGH

**[H1] `patchScriptStatus` 存在 TOCTOU 竞态（无事务保护）**
`repository.ts:300-328`：读取当前 status 与写入新 status 分为两次独立 DB 请求，未包在 `db.transaction()` 中。并发场景下，同一 script 可能被两个请求同时读到相同 from status，均通过状态机校验后各自写入，造成状态机绕过。
建议：使用 `db.transaction()` 包裹读+assertTransition+写，或改用 `UPDATE ... WHERE status = 'draft' RETURNING` 的原子写法（CAS）。

---

## MEDIUM

**[M1] `getScriptById` 的 scriptTagRelations 查询未附加 tenantId 过滤**
`repository.ts:172`：`WHERE scriptId = id` 仅用 scriptId 过滤，tenantId 验证依赖第一步主表查询的隐式保护。若未来调用方顺序变化或被单独复用，可能越权读取他租户的标签关系。建议 join scriptTags 表并带 tenantId 过滤，或加代码注释说明设计决策。

**[M2] `updateScript` 测试的标签重写分支断言不完整**
`scripts-repository.test.ts:369`：测试验证了 `mockDelete` 和 `mockInsert` 被调用，但未验证 `mockValues` 接收了正确的 `[{ scriptId, tagId }]` 结构，也未验证 delete 的 where 条件包含 `scriptId`（不含 tenantId），存在轻微断言盲区。

---

## LOW

**[L1] `listScripts` 测试未覆盖 `q` 包含 SQL 特殊字符（`%`, `_`, `\`）的转义逻辑**
转义代码存在于 repository 中，但测试只传了普通中文字符串，建议补一条 `q: "100%"` 的用例确认转义路径被执行。

---

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 1     | warn   |
| MEDIUM   | 2     | info   |
| LOW      | 1     | note   |

**Verdict: PASS（带警告）** — 存在 1 个 HIGH 问题（`patchScriptStatus` TOCTOU 竞态），建议在并发压力可控的 MVP 阶段先记录为 TODO，在正式生产前修复。CRITICAL 为零，不阻断合并。
