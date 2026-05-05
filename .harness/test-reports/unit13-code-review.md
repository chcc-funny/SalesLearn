### 判定: PASS

## 审查对象
- `lib/services/scripts/copy.ts`
- `tests/unit/scripts-copy-service.test.ts`

---

## 1. 事务边界

`logScriptCopy` 将 UPDATE + INSERT 完全包在 `db.transaction()` 内。
UPDATE 失败（0 行）时立即 `throw new ScriptCopyError()`，事务自动回滚，INSERT 不执行。
结论：事务边界正确，无「自增成功但日志缺失」风险。

## 2. UPDATE 0 行守卫

`tx.update(...).returning()` 返回数组，取 `[updated]` 解构；若为空数组则 `updated` 为 `undefined`，
命中 `if (!updated)` 守卫后立即抛错。逻辑正确，守卫合理。

## 3. 防止重复刷量（并发竞态）

使用 `sql\`${scripts.usageCount} + 1\`` 原子 SQL 表达式自增，而非 select-then-update，
规避并发读到同一值后双写的竞态问题。WHERE 条件包含 `status='published' + tenant_id + deleted_at IS NULL`，
额外限制了操作范围。

**但注意（MEDIUM）**：当前版本没有限制同一用户在短时间内对同一 `scriptId` 反复调用（刷量）。
文件注释指出 rate limit 由 API 层负责，但该 API route 文件在本次提交中未提供，无法确认 rate limit 是否已实现。
建议在 API 层补充每用户/每话术的调用频率限制，否则单用户可任意刷高 `usage_count`。

## 4. 安全

- 无硬编码凭证
- 所有参数通过 ORM 参数化，无 SQL 注入风险
- `deviceInfo` 仅接受形参，显式 `void` 忽略，不入库——防止调用方传入任意字段透传写库，设计良好
- `source` 同样 `void` 忽略，v1 不入库

## 5. 测试覆盖质量

| 场景 | 覆盖 |
|---|---|
| 成功路径：自增+写日志 | 是 |
| SQL 表达式自增（非 plain number） | 是 |
| deviceInfo 不入库 | 是 |
| UPDATE 0 行 → 抛 ScriptCopyError | 是 |
| UPDATE 0 行 → INSERT 不执行 | 是 |
| 跨租户 → 抛错无副作用 | 是 |
| 事务 tx 实例共享 | 是 |
| ScriptCopyError instanceof 跨编译目标 | 是 |

覆盖率充分，测试设计对核心业务约束的验证到位。

---

## 问题汇总

| 严重度 | 描述 |
|---|---|
| MEDIUM | rate limit 未在 API 层确认实现，存在刷量风险，需在 copy API route 中明确添加频率限制 |
