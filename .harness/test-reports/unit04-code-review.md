---
title: unit04 code-review — lib/db/schema/script-copy-logs.ts
reviewer: harness-tester-code-review
date: 2026-05-01
---

### 判定: PASS

（无 CRITICAL/HIGH 问题；MEDIUM/LOW 建议见下方）

---

#### 审查详情

##### 1. 字段类型合理性

| 字段 | 类型 | 评估 |
|---|---|---|
| `id` | BIGSERIAL PK (mode: bigint) | 合理，日志表高写场景用自增 bigint 优于 UUID，减少索引碎片 |
| `tenant_id` | UUID NOT NULL | 合理，冗余存储便于按租户查询日志，无需 JOIN scripts |
| `script_id` | UUID NOT NULL FK scripts ON DELETE CASCADE | 合理，见 §2 |
| `user_id` | UUID NOT NULL FK users | 合理，见 §2 |
| `copied_at` | TIMESTAMPTZ NOT NULL defaultNow() | 合理，时区一致性 |

所有字段与文档 §3.4 完全对应。

##### 2. 外键策略

- `script_id → scripts.id ON DELETE CASCADE`：合理。话术软删（deleted_at 非 null）通常不触发物理删除，因此 CASCADE 在正常业务流程中不会误删日志。即使发生物理清理，日志随之删除也合理（孤立日志无意义）。
- `user_id → users.id`：未声明 `onDelete`，默认 NO ACTION（RESTRICT）。合理，用户账户不应随意物理删除；若存在软删用户场景，需在 service 层保障一致性（与 scripts.ts 中 created_by 策略一致）。

**注意**：`script_id` 引用的是 `scripts` 表（支持软删），而非直接引用已发布话术。当话术被软删（`deleted_at` 非 null）后，`script_id` 外键仍然有效（行存在），日志历史被完整保留。此设计与文档意图一致。

##### 3. 索引设计

| 索引 | 字段 | 评估 |
|---|---|---|
| `idx_script_copy_logs_script` | (script_id, copied_at) | 按话术统计复制次数/趋势，覆盖 usage_count 相关查询，合理 |
| `idx_script_copy_logs_user` | (user_id, copied_at) | 按用户查询复制历史，覆盖评估看板场景，合理 |

文档 §3.4 中索引带有 `DESC` 关键字（`copied_at DESC`），Drizzle 的 `index().on(col)` 默认升序。对于时间范围查询，升序/降序索引差异通常可被 PG 优化器反向扫描抵消，但如评估看板以「最近 N 条」为主查询模式，可考虑显式指定降序。此差异不影响正确性。

##### 4. 命名一致性

与项目其他 schema 文件风格一致：
- 驼峰 camelCase JS 属性 + snake_case 列名
- `copiedAt` 替代 `createdAt` 命名语义更精确，符合日志表习惯
- 索引命名 `idx_<table>_<key>` 对齐
- 无 `updatedAt`：日志表不可变，符合设计

唯一差异：主键使用 `bigserial` 而非 `uuid`，这是有意为之（高写场景优化），不是风格不一致。

##### 5. 类型导出

```typescript
export type ScriptCopyLog = typeof scriptCopyLogs.$inferSelect;    // ✓
export type NewScriptCopyLog = typeof scriptCopyLogs.$inferInsert; // ✓
```
同时导出 select + insert 类型，符合项目惯例。

##### 6. 时间字段

`copiedAt`：`withTimezone: true`，`notNull()`，`defaultNow()` — 正确。
本表为只追加日志表，无 `updatedAt` 字段，设计合理。

##### 7. 设计文档对齐

对照 `docs/features/scripts/README.md §3.4`，所有字段一一对应，外键、索引均与文档 SQL 一致。

文档提到 `usage_count` 通过「SQL 原子表达式自增」，同时写 copy log 实现双写。本 schema 支持该设计（无约束阻止），具体原子性需在 API route 层通过事务保障，schema 层不需要额外约束。

##### 8. 隐患

无 CRITICAL/HIGH 隐患。

---

#### 改进建议（非阻塞）

**MEDIUM-1：`tenant_id` 缺少索引（跨租户查询场景）**

当前两个索引均以 `script_id` / `user_id` 为前导列。若评估看板需要「按租户聚合所有复制行为」（如 `WHERE tenant_id = ? GROUP BY script_id`），则需扫描全表。建议评估是否需要增加：
```typescript
index("idx_script_copy_logs_tenant").on(table.tenantId, table.copiedAt),
```
如果所有查询都先通过 `script_id` 或 `user_id` 过滤（这两者都隐含了租户范围），则此索引可以不加。当前设计偏保守，可接受。

**LOW-1：`bigserial` mode: "bigint" 的 TypeScript 类型注意**

Drizzle 的 `bigserial(..., { mode: "bigint" })` 在 `$inferSelect` 中会生成 `bigint` 类型（JavaScript BigInt），而非 `number`。调用方序列化为 JSON 时需注意 `BigInt` 不能直接 `JSON.stringify`，需转换为字符串或数字。建议在 service 层或 API response 序列化时统一处理，或改用 `{ mode: "number" }`（BIGSERIAL 值在 JS number 安全整数范围内时可行，但超过 2^53 时有精度丢失风险）。当前选择 `bigint` 更安全，注意序列化即可。

**LOW-2：日志表无 TTL / 归档策略**

纯追加写入的日志表在高频复制场景下会持续增长。建议在文档或 README 中注明定期归档策略（如按月分区或定期清理 N 天前记录），Schema 层无需立即修改，但应在 Phase 3 评估看板设计时一并考虑。
