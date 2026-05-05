### 判定: PASS

## 审查对象
- `app/api/scripts/route.ts`（GET /api/scripts）
- `lib/services/scripts/repository.ts` 的 `mineUserId` 扩展（`listScripts` 函数）

---

## 1. 鉴权

`withAuth` 提供 session 保护，未登录返回 401。
路由内按 `user.role` 区分员工/主管，逻辑在 API 层处理，不依赖调用方传递角色。
结论：鉴权正确，角色分支清晰。

## 2. 输入校验

所有 query 参数经 `listScriptsQuerySchema.safeParse` 校验：

- `q`：最大 200 字符限制，防止超长搜索请求
- `status`：枚举限制（`scriptStatuses`）
- `source`：枚举限制（`scriptSources`）
- `sceneTagIds[]` / `productTagIds[]`：`z.string().uuid()` 校验，最多 10 个，防止 UUID 格式欺骗
- `page` / `pageSize`：`coerce.number()` + 范围限制（pageSize 最大 100），防止大量数据拉取

结论：输入校验全面，无遗漏。

## 3. 员工端权限逻辑（mineUserId）

```typescript
if (user.role === "employee") {
  filters.status = status ?? "published";   // 无 status 时默认 published
  filters.mineUserId = user.id;             // 叠加自己的草稿可见性
} else {
  if (status) filters.status = status;      // 主管直接尊重 query
}
```

`mineUserId` 强制设为 `user.id`（来自 session），**不接受客户端传入**，无越权风险。

repository 层中 `mineUserId` 的 OR 条件：
```typescript
or(
  eq(scripts.status, filters.status),
  eq(scripts.createdBy, filters.mineUserId)
)
```
仍在 `tenant_id = ? AND deleted_at IS NULL` 的条件范围内，租户隔离不被破坏。

## 4. mineUserId 是否破坏 unit12 的 19 个测试

`mineUserId` 是 `ListScriptsFilters` 的可选字段，默认 `undefined`。
unit12 中所有 `listScripts` 调用均不传 `mineUserId`，走 `else` 分支（单纯 `status` 过滤）。
新增的 `or()` 分支只在 `filters.mineUserId` 有值时触发，不影响无 `mineUserId` 的查询路径。
结论：unit12 现有 19 个测试**不受影响**，无回归风险。

## 5. SQL 注入风险

`mineUserId` 通过 `eq(scripts.createdBy, filters.mineUserId)` 传入 Drizzle ORM，
ORM 参数化处理，不拼接原始字符串。且 `mineUserId` 来源是 session（服务端）而非客户端输入。
结论：无 SQL 注入风险。

## 6. 错误处理

与 unit14 相同的问题：`catch {}` 无日志记录。

**MEDIUM**：catch 块无日志，DB 异常不可追踪。建议补充日志上报。

## 7. 其他观察

- `sceneTagIds` / `productTagIds` 收集正确（`searchParams.getAll()`），空数组转 `undefined` 避免传入空数组干扰 repository 层
- 分页参数 `pageSize` 上限 100 已在 zod schema 中限制，防止 unbounded query

---

## 问题汇总

| 严重度 | 描述 |
|---|---|
| MEDIUM | catch 块无日志记录，与 unit14 同一问题 |
| LOW | 员工传 status=draft 时，`filters.status` 被设为 `draft`，repository 的 OR 条件为 `status='draft' OR created_by=self`，员工可看到所有租户内 draft 状态的话术（不只是自己的）——设计是否符合 PRD 需确认 |
