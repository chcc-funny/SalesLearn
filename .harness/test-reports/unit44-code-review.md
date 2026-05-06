### 判定: PASS

## unit44 — POST /api/admin/scripts/[id]/review

**文件**：`app/api/admin/scripts/[id]/review/route.ts` + `tests/integration/admin-scripts-review.test.ts`

---

### 审查结论

权限控制、状态机、编辑顺序均正确。rejectReason 未持久化已有文档标注。无 CRITICAL / HIGH 问题。

---

### 各维度核查

**1. discriminatedUnion 设计**

`reviewScriptSchema` 使用 `z.discriminatedUnion('action', [...])` 区分 approve（可选 edits）和 reject（必填 rejectReason）。zod 在 discriminatedUnion 上的错误路由准确：非法 action（如 `"delete"`）会返回 400，符合预期。测试覆盖了 unknown action、缺 action、空字符串 rejectReason，均验证到 400。

**2. approve + edits 执行顺序**

路由第 79-113 行：有 edits 时先调 `updateScript`（内部事务同步标签）→ 若返回 null 则 404 直接返回，不再 patch 状态；若 update 成功再调 `patchScriptStatus` 切 published。顺序正确，避免内容写入失败后状态机仍切换的问题。测试用例"approve 带 edits 但 updateScript 返回 null → 404"断言 `patchScriptStatus` 未被调用，覆盖了这个边界。

**3. rejectReason 未持久化**

路由注释（第 42-43 行）明确标注：v1 reject 只切状态，`rejectReason` 未写库，Phase 2 需扩展 service 层的 `patchScriptStatus`。DB schema 已有 `reject_reason TEXT` 字段，路由已通过 zod 校验确保字段非空（防止调用方传空字符串），只是尚未写入。这是已知、文档化的 v1 简化，属于功能欠缺而非安全漏洞，MEDIUM 级别。测试的 reject 用例断言 `patchScriptStatus` 被以正确参数调用，与实现一致。

**4. reviewedBy / reviewedAt 是否落库**

`patchScriptStatus` 当前只写 `status` 和 `updatedAt`（repository.ts 第 355-357 行），未写 `reviewedBy` / `reviewedAt`。DB schema 应有这两个字段，但路由和 service 均未填充。这是与 rejectReason 相同性质的 v1 简化——功能不完整但不是安全漏洞。MEDIUM 级别，需在 Phase 2 扩展 `patchScriptStatus` 签名时补齐。

**5. manager-only 权限**

路由第 131 行 `withAuth(..., ["manager"])` 严格限制只有 manager 角色可访问。测试"员工调用 → 403"断言 `patchScriptStatus` 未被调用。guard mock 正确模拟了 allowedRoles 检查。

**6. tenantId 安全**

所有 service 调用均传 `user.tenantId`（来自 session），路径 id 只从 params 取，body 无 tenantId 字段（reviewScriptSchema 未声明），不可注入。

**7. 整体测试覆盖**

正路径：approve 无 edits / 有 edits / reject。
负路径：缺 id / 非 UUID id / 缺 action / 非法 action / 缺 rejectReason / 空 rejectReason / edits 超长 / 状态机非法跳转 / 不存在 404 / DB 500。
越权：员工 403 / 未登录 401 黑盒。
覆盖完整。

---

### 低优先级备注（不阻塞）

- [MEDIUM] `reviewedBy` / `reviewedAt` 未落库：审计追踪功能不完整，Phase 2 需修复。
- [MEDIUM] `rejectReason` 未持久化：员工无法查看拒绝原因，Phase 2 需修复。
- [LOW] approve 带 edits 场景中，`updateScript` 和 `patchScriptStatus` 是两个独立事务，中间有窗口期（内容已改但状态未切换），理论上与 unit43 相同的 tradeoff，v1 可接受。

---

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 2     | info   |
| LOW      | 1     | note   |

**Verdict: PASS — 可合并。MEDIUM 问题（reviewedBy/At、rejectReason 持久化）已在代码注释中标注，Phase 2 补齐。**
