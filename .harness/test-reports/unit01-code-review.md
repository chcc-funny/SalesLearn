---
title: unit01 code-review — lib/db/schema/scripts.ts
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
| `title` | VARCHAR(200) NOT NULL | 合理，与文档一致 |
| `customer_question` | TEXT NOT NULL | 合理（API 层再用 zod 限 500 字）|
| `question_aliases` | JSONB NOT NULL DEFAULT `[]` | 合理，v1 预留字段 |
| `answer` | TEXT NOT NULL | 合理 |
| `source` | VARCHAR(20) NOT NULL | 合理；见 MEDIUM-1 |
| `knowledge_id` | UUID nullable | 合理，ON DELETE SET NULL |
| `status` | VARCHAR(20) NOT NULL DEFAULT 'draft' | 合理；见 MEDIUM-1 |
| `usage_count` | INTEGER NOT NULL DEFAULT 0 + CHECK ≥ 0 | 合理，约束完整 |
| `created_by` | UUID NOT NULL FK users | 合理 |
| `reviewed_by` | UUID nullable FK users | 合理 |
| `reviewed_at` | TIMESTAMPTZ nullable | 合理 |
| `reject_reason` | TEXT nullable | 合理 |
| `submission_request_id` | UUID UNIQUE nullable | 合理，Phase 2 幂等字段 |
| `deleted_at` | TIMESTAMPTZ nullable | 合理，软删 |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL defaultNow() | 合理 |

##### 2. 外键策略

- `knowledge_id → knowledge_base.id ON DELETE SET NULL`：合理，知识库被删除后话术不应级联删除，仅断开关联。
- `created_by → users.id`：未声明 `onDelete`，Drizzle 默认 NO ACTION（即 RESTRICT）。合理，创建者账户不应随意删除；但如果业务存在软删用户场景，需在 service 层保障一致性。
- `reviewed_by → users.id`：同上，RESTRICT。合理。

##### 3. 索引设计

| 索引 | 字段 | 评估 |
|---|---|---|
| `idx_scripts_tenant_status` | (tenant_id, status) WHERE deleted_at IS NULL | 核心查询索引，partial index 正确 |
| `idx_scripts_source` | (tenant_id, source) | 按来源过滤场景合理 |
| `idx_scripts_knowledge` | (knowledge_id) | 外键查询合理 |
| CHECK usage_count ≥ 0 | — | 约束完整 |

**缺失索引（MEDIUM-2）**：文档 §5.1 要求 `pg_trgm` GIN 索引用于模糊匹配，即：
```sql
CREATE INDEX idx_scripts_trgm_question ON scripts
  USING GIN (customer_question gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_scripts_trgm_title ON scripts
  USING GIN (title gin_trgm_ops) WHERE deleted_at IS NULL;
```
这两个索引在 schema 文件中未声明，若在 Drizzle migration 生成中未包含，则 v1 检索性能会依赖全表扫描。

##### 4. 命名一致性

与 `knowledge-base.ts` / `users.ts` 风格完全一致：
- 驼峰 camelCase JS 属性 + snake_case 列名
- `createdAt/updatedAt` 命名对齐
- `tenantId` 前缀对齐
- 索引命名 `idx_<table>_<key>` 对齐

##### 5. 类型导出

```typescript
export type Script = typeof scripts.$inferSelect;    // ✓
export type NewScript = typeof scripts.$inferInsert; // ✓
```
同时导出了 select + insert 类型，符合项目惯例。

##### 6. 时间字段

- `createdAt` / `updatedAt`：`withTimezone: true`，`notNull()`，`defaultNow()` — 全部正确，与其他 schema 一致。
- `reviewed_at`、`deleted_at`：nullable，`withTimezone: true` — 合理。

##### 7. 设计文档对齐

对照 `docs/features/scripts/README.md §3.1`，所有字段均一一对应，无遗漏或新增字段。

##### 8. 隐患

无 CRITICAL/HIGH 隐患。

---

#### 改进建议（非阻塞）

**MEDIUM-1：`source` / `status` 应使用 Drizzle `pgEnum` 或配合 DB-level 约束**

当前 `source` 和 `status` 都是 `VARCHAR(20) NOT NULL`，enum 常量仅在 TypeScript 层做了约束，但数据库层无 CHECK 或 ENUM 约束，允许写入任意字符串（如直接 SQL INSERT 绕过 ORM）。其他项目 schema 同样采用此模式（knowledge-base.ts 亦如此），故仅列为 MEDIUM。

建议：可在 schema 定义中补充 DB-level CHECK 约束，与 `usage_count` 的处理方式统一。示例：
```typescript
check(
  "scripts_status_valid",
  sql`${table.status} IN ('draft','pending_review','published','rejected','archived')`
)
```

**MEDIUM-2：缺少 pg_trgm GIN 索引声明**

文档 §5.1 明确说明 v1 检索依赖 `pg_trgm` GIN 索引，但 schema 文件未包含：
```typescript
// 建议在 (table) => [...] 中追加：
index("idx_scripts_trgm_question").using("gin", table.customerQuestion),
index("idx_scripts_trgm_title").using("gin", table.title),
```
若这两个索引在单独的 migration SQL 文件中管理，则此项可忽略。需确认落地位置。

**LOW-1：`updatedAt` 无数据库触发器自动更新**

项目现有 schema（如 users.ts、knowledge-base.ts）均采用相同模式，`updatedAt` 仅设置了 `defaultNow()` 而无 `ON UPDATE` 触发器。当前 schema 与项目风格保持一致，但需注意：ORM 层若漏传 `updatedAt`，值不会自动刷新。建议在 service 层统一处理。

**LOW-2：`index.ts` 未导出新 schema**

`lib/db/schema/index.ts` 尚未包含 `scripts`、`script-tags`、`script-copy-logs` 的导出，文档 §1.4 中「触碰点 3」已列明需添加。此项不属于 schema 文件本身的问题，提醒关注。
