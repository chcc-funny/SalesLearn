### 判定: PASS

**审查单元**: unit22 — `POST /api/admin/scripts/[id]/archive`

**文件**:
- `app/api/admin/scripts/[id]/archive/route.ts`
- `tests/integration/admin-scripts-archive.test.ts`

---

## 路由实现

**状态机错误 → 400**: 正确。`catch (err)` 分支以 `instanceof ScriptStateTransitionError` 精确判断，返回 `ErrorCode.VALIDATION_ERROR`（HTTP 400）。非业务异常 fallthrough 到 `DATABASE_ERROR`（500），分支清晰。

**null → 404**: 正确。`archiveScript` 返回 `null` 时（不存在 / 跨租户 / 已软删），返回 `ErrorCode.NOT_FOUND`（404）。跨租户 ID 枚举防御在 service 层通过 `(id, tenantId)` 复合条件处理，路由层统一 404 不泄露租户信息。

**manager-only**: 正确。`withAuth(..., ["manager"])` 在路由层强制，employee 调用在 guard 层被拦截，不会进入 handler。

**ID 校验**: `idSchema = z.string().uuid(...)` 在调用 service 前挡住格式非法的 ID，`mockArchiveScript` 不会被调用。

---

## 集成测试

**覆盖率**: 全面。涵盖成功路径、null→404、跨租户→404、4 种非法状态转移→400、缺 id→400、非 UUID→400、employee→403、DB 异常→500、401 黑盒契约、跨租户安全断言（tenantId 来源校验）。

**mock 颗粒度**: `vi.hoisted` 正确复刻 `ScriptStateTransitionError`（含 `Object.setPrototypeOf`），`instanceof` 判断与生产代码语义对齐。`withAuth` mock 正确模拟角色检查和 params 解析。

**错误信息断言**: `it.each` 用例额外断言 `json.error` 包含 `from` 和 `to`，覆盖了错误消息透出场景。

---

## 无 CRITICAL / HIGH 问题

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 0     |
| LOW      | 0     |
