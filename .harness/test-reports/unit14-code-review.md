### 判定: PASS

## 审查对象
- `app/api/scripts/tags/route.ts`

---

## 1. 鉴权

使用 `withAuth` 包裹，无额外 `allowedRoles` 限制，即任意已登录用户（员工/主管）均可读取标签列表。
符合注释说明的「公开读」语义——标签数据非敏感，员工端构建筛选器时需要加载全量标签。
结论：鉴权层级合理。

## 2. 输入校验

所有 query 参数经 `listScriptTagsQuerySchema.safeParse` 校验：

- `groupKey`：枚举限制，非法值直接 422 VALIDATION_ERROR
- `onlyActive`：自定义 `queryBooleanSchema` 正确处理 `"true"/"false"/"1"/"0"` 及 `boolean` 类型，
  规避了 `z.coerce.boolean()` 将 `"false"` → `true` 的已知坑点

校验失败路径：返回 `VALIDATION_ERROR`，不泄露内部细节，正确。

## 3. 错误处理

- 401 UNAUTHORIZED：由 `withAuth` 在 session 缺失时返回
- 400 VALIDATION_ERROR：query 校验失败时返回
- 500 DATABASE_ERROR：`catch {}` 块返回通用错误信息，不泄露数据库细节

`catch` 块吞掉了原始 error 对象，无服务端日志记录。

**MEDIUM**：`catch {}` 分支没有 `console.error` 或日志上报。数据库异常时运维无法定位问题。
建议补充 `console.error` 或接入日志服务（符合项目 CLAUDE.md 的错误处理要求）。

## 4. 租户隔离

`user.tenantId` 来自 session，由 `withAuth` 注入，不可被客户端伪造。
`listTags(user.tenantId, ...)` 强制带 `tenant_id` WHERE 条件，隔离正确。

## 5. SSRF / SQLi / XSS

- query 参数通过 zod 枚举/boolean 校验后才传入服务层，无注入风险
- 返回的 tag 数据源自数据库，JSON 序列化输出，无 XSS 风险

## 6. 响应格式

`successResponse(grouped)` 统一封装，格式一致。
`grouped` 初始化为 `{ scene: [], product: [] }` 兜底，即便 DB 为空也返回正确结构。
`scriptTagGroupKeys.includes(key)` 防御性跳过未知 groupKey，设计严谨。

---

## 问题汇总

| 严重度 | 描述 |
|---|---|
| MEDIUM | catch 块无日志记录，生产环境数据库异常无法追踪 |
