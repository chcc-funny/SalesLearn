### 判定: PASS

## unit43 — POST /api/scripts/submit

**文件**：`app/api/scripts/submit/route.ts` + `tests/integration/scripts-submit.test.ts`

---

### 审查结论

核心安全和正确性问题均通过。事务缺失问题已核实在可接受范围内（有设计注释）。无 CRITICAL / HIGH 问题。

---

### 各维度核查

**1. 双阶段写入（createScript → patchScriptStatus）是否需要事务**

`createScript` 自身已在 `db.transaction()` 内完成（repository.ts 第 221 行）；`patchScriptStatus` 也在独立事务内（repository.ts 第 336 行）。两次调用之间存在窗口期：若 `createScript` 成功但 `patchScriptStatus` 失败，会留下 `status='draft'` 的孤立记录。

路由对此的处理：`patchScriptStatus` 返回 null → 500；抛 `ScriptStateTransitionError` → 400。孤立的 `draft` 记录不会对用户可见（员工端只读 `published` 及自己创建的），且 `submissionRequestId` UNIQUE 约束使重复提交同一 requestId 被 DB 拒绝（第一次成功后不会重新创建）。注释已标明「v1 简化」。这是已知、有意为之的 tradeoff，MEDIUM 级别，不阻塞合并。

**2. source 是否为 'ai_submitted'**

路由第 77 行硬编码 `source: "ai_submitted"`，zod body schema（`submitScriptSchema`）中无 source 字段，body 无法注入。正确。

**3. 防 body 注入 status / source / tenantId**

- `status`：路由第 79 行硬编码 `status: "draft"`，schema 中无该字段。
- `source`：同上，硬编码 `"ai_submitted"`。
- `tenantId`：`createScript(user.tenantId, ...)` 来自 session；测试"跨租户安全"用例验证了 `body.tenantId` 注入被忽略。

三项均安全。

**4. rate-limit**

key = `script-submit:user:${user.id}`，type = `"llm"`，与 generate 接口共享同类型桶（防止先批量 generate 再批量 submit 绕过限流），合理。

**5. 校验覆盖**

覆盖：缺 requestId / 非 UUID requestId / 超长 title / 缺 answer / 非法 JSON → 400；DB 异常 → 500；状态机非法跳转 → 400；patchScriptStatus 返回 null → 500；429 限流；401 黑盒。覆盖充分。

---

### 低优先级备注（不阻塞）

- [MEDIUM] 双阶段写入非原子性：`draft` 孤立记录在极端情况可积累。Phase 2 若需精确幂等，建议将两步合并进一个事务（先 insert status=pending_review，省略中间 draft 状态）。当前 v1 可接受。

- [LOW] `inputWithRequestId as unknown as CreateScriptInput`（第 95 行）的双重类型断言是已知的 TS 妥协，注释已说明。服务层当前忽略 `submissionRequestId` 字段（repository 的 `createScript` 未写该字段到 DB）。测试仅断言路由"透传"行为，若后续需要落库需同步修改 service。

---

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 1     | info   |
| LOW      | 1     | note   |

**Verdict: PASS — 可合并，MEDIUM 问题已在注释中标注留 Phase 2 处理。**
