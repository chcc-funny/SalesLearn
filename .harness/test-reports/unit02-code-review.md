---
title: unit02 code-review — lib/db/schema/script-tags.ts
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
| `id` | UUID PK | 合理 |
| `tenant_id` | UUID NOT NULL | 合理 |
| `group_key` | VARCHAR(20) NOT NULL | 合理；见 MEDIUM-1 |
| `name` | VARCHAR(50) NOT NULL | 合理，标签名长度适中 |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | 合理，拖拽排序需求 |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | 合理，软停用方案 |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL defaultNow() | 合理 |

所有字段与文档 §3.2 完全对应，无遗漏。

##### 2. 外键策略

本表无外键。`tenant_id` 是逻辑多租户字段，无 DB-level FK 引用（与项目其他表风格一致，`tenants` 表未在当前 schema 中定义）。合理。

此表与 `scripts` 的关联通过 `script_tag_relations` 中间表（unit03，本批未审查）实现，外键策略应在 unit03 中评估。

##### 3. 索引设计

| 索引 | 字段 | 评估 |
|---|---|---|
| UNIQUE `uq_script_tags_tenant_group_name` | (tenant_id, group_key, name) | 核心唯一约束，防同租户同分组重名标签，合理 |
| `idx_script_tags_group` | (tenant_id, group_key, is_active) | 员工端筛选 `is_active=true` 的标签，覆盖主要查询路径，合理 |

索引设计完整，无明显缺失。

##### 4. 命名一致性

与 `knowledge-base.ts` / `users.ts` / `scripts.ts` 风格完全一致：
- 驼峰 camelCase JS 属性 + snake_case 列名
- `createdAt/updatedAt` 命名对齐
- `tenantId` 前缀对齐
- UNIQUE 约束命名 `uq_<table>_<key>` 与索引命名 `idx_<table>_<key>` 清晰区分

##### 5. 类型导出

```typescript
export type ScriptTag = typeof scriptTags.$inferSelect;    // ✓
export type NewScriptTag = typeof scriptTags.$inferInsert; // ✓
```
同时导出 select + insert 类型，符合项目惯例。

##### 6. 时间字段

`createdAt` / `updatedAt`：`withTimezone: true`，`notNull()`，`defaultNow()` — 全部正确，与其他 schema 一致。

##### 7. 设计文档对齐

对照 `docs/features/scripts/README.md §3.2`，所有字段一一对应，UNIQUE 约束、索引均与文档 SQL 匹配。

##### 8. 隐患

无 CRITICAL/HIGH 隐患。

---

#### 改进建议（非阻塞）

**MEDIUM-1：`group_key` 缺少 DB-level CHECK 约束**

`scriptTagGroupKeys` 常量仅在 TypeScript 层约束取值为 `["scene", "product"]`，数据库层无 CHECK 或 ENUM 防护。与 unit01 同类问题，可补充：
```typescript
check(
  "script_tags_group_key_valid",
  sql`${table.groupKey} IN ('scene', 'product')`
)
```
若未来新增分组类型，只需更新 CHECK 约束和常量，不需要 ALTER COLUMN。

**LOW-1：`sort_order` 无唯一约束**

文档描述标签支持「拖拽排序」，但 `sort_order` 在 (tenant_id, group_key) 范围内没有唯一约束，允许多个标签的 sort_order 相同。这是常见的排序字段设计，通常依赖应用层管理顺序，不构成严重问题，但需注意排序逻辑的稳定性（相同 sort_order 时需二级排序字段如 `created_at`）。

**LOW-2：停用标签的数据完整性说明**

文档 §4.3 说明删除标签即软删（`is_active=false`），「保留历史关联」。Schema 层面此行为需依赖 `script_tag_relations` 表的外键策略（unit03 中的 `ON DELETE RESTRICT`）配合实现——当 `is_active=false` 时不删除行，因此 RESTRICT 不会被触发。此设计无问题，但建议在 service 层注释中说明软删流程，避免误操作硬删标签行触发 FK 报错。
