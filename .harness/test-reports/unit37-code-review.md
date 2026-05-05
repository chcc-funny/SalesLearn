### 判定: PASS

**unit37 — lib/services/scripts/fulltext-search.ts**

---

## SQL 参数化

**通过。** 全程使用 drizzle 的 `sql` tagged template 和 ORM 列引用（`eq(scripts.tenantId, ...)` 等），用户输入 `trimmed` 通过模板占位符传递，不存在字符串拼接。pg_trgm 的 `%` 操作符通过 `sql\`...\`` 模板参数化，`'; DROP TABLE scripts; --` 场景在测试中已验证不抛错。

## 多租户隔离

**通过。** `tenantId` 作为必填入参，始终出现在 `conditions` 数组中（`eq(scripts.tenantId, input.tenantId)`），无法绕过。

## 默认条件

**通过。** `status='published'` 和 `deletedAt IS NULL` 硬编码在 `conditions` 数组中，默认不可修改（无参数允许调用方覆盖）。

## SQL 注入防护

**通过。** `trimmed` 变量通过 drizzle sql 模板参数化，不拼接原始字符串。

## 空 query 短路

**通过。** `trimmed.length === 0` 时立即 `return []`，不触发数据库查询。

## 轻微问题（LOW）

- `limit` 上界未约束（理论上调用方可传 10000）。当前属于内部服务，API 层应补充上界校验，此处不构成 CRITICAL。
- 测试中的多租户隔离测试（第 167 行）依赖 `mockLimit` 按调用顺序返回两个不同值，实际上两次调用互相独立并未真正校验 where 参数中的 tenantId 值各自不同。这是 mock 测试的固有局限，属于 LOW 级别覆盖不足。

## 问题汇总

| 严重度 | 描述 |
|--------|------|
| LOW    | limit 未设置上界，建议在 API 层强制 ≤ 50 |
| LOW    | 多租户隔离测试没有断言 where 参数中 tenantId 值的差异，仅验证了调用次数 |

