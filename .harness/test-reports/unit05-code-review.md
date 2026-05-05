### 判定: PASS

# unit05 代码审查 — `lib/db/schema/index.ts` + `drizzle/0001_clear_random.sql`

审查维度：barrel 导出完整性 / 命名冲突 / DDL 顺序 / 外键约束 / pg_trgm 索引语法

---

## 摘要

| 严重级别 | 数量 |
|----------|------|
| CRITICAL | 0    |
| HIGH     | 0    |
| MEDIUM   | 1    |
| LOW      | 2    |

---

## barrel 导出 (`lib/db/schema/index.ts`)

### 导出完整性
新增 4 个文件均已加入 barrel：
- `export * from "./scripts"` ✓
- `export * from "./script-tags"` ✓
- `export * from "./script-tag-relations"` ✓
- `export * from "./script-copy-logs"` ✓

### 命名冲突检查
逐一比对既有 schema 导出符号与新增符号：
- `scripts` / `scriptTags` / `scriptTagRelations` / `scriptCopyLogs` — 唯一，无冲突
- `Script` / `ScriptTag` / `ScriptTagRelation` / `ScriptCopyLog` — 唯一，无冲突
- `scriptStatuses` / `scriptSources` / `scriptTagGroupKeys` — 唯一，无冲突
- 既有的 `knowledgeStatuses` / `questionStatuses` 与新增 `scriptStatuses` 不同名，无冲突

**结论：无命名冲突，既有导出未被破坏。**

---

## 迁移 SQL (`drizzle/0001_clear_random.sql`)

### DDL 顺序
```
CREATE EXTENSION pg_trgm
CREATE TABLE scripts          (引用 knowledge_base, users)
CREATE TABLE script_tags
CREATE TABLE script_tag_relations (无列级 FK，后续 ALTER ADD CONSTRAINT)
CREATE TABLE script_copy_logs (无列级 FK，后续 ALTER ADD CONSTRAINT)
ALTER TABLE scripts           ADD FK → knowledge_base, users
ALTER TABLE script_tag_relations ADD FK → scripts, script_tags
ALTER TABLE script_copy_logs  ADD FK → scripts, users
CREATE INDEX ...
```

Drizzle 使用 `ALTER TABLE ... ADD CONSTRAINT` 追加外键，所以表创建顺序与依赖顺序无强关联；所有被引用表（`knowledge_base`、`users`、`scripts`、`script_tags`）均在迁移文件内或已存在于 0000 迁移，顺序正确。

### 外键约束完整性

| 约束 | 引用 | onDelete |
|---|---|---|
| `scripts_knowledge_id_knowledge_base_id_fk` | `knowledge_base(id)` | SET NULL ✓ |
| `scripts_created_by_users_id_fk` | `users(id)` | NO ACTION ✓ |
| `scripts_reviewed_by_users_id_fk` | `users(id)` | NO ACTION ✓ |
| `script_tag_relations_script_id_scripts_id_fk` | `scripts(id)` | CASCADE ✓ |
| `script_tag_relations_tag_id_script_tags_id_fk` | `script_tags(id)` | RESTRICT ✓ |
| `script_copy_logs_script_id_scripts_id_fk` | `scripts(id)` | CASCADE ✓ |
| `script_copy_logs_user_id_users_id_fk` | `users(id)` | NO ACTION ✓ |

全部外键完整，与 README §3.x 一致。

### pg_trgm 扩展与部分索引语法

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "idx_scripts_trgm_question" ON "scripts"
  USING GIN ("customer_question" gin_trgm_ops)
  WHERE "scripts"."deleted_at" IS NULL;
CREATE INDEX "idx_scripts_trgm_title" ON "scripts"
  USING GIN ("title" gin_trgm_ops)
  WHERE "scripts"."deleted_at" IS NULL;
```

- `USING GIN` + `gin_trgm_ops` 语法正确，适合中文/短文本 trigram 模糊匹配
- `WHERE deleted_at IS NULL` 部分索引语法正确，可减小索引体积并加速常用查询路径
- `CREATE EXTENSION IF NOT EXISTS` 保证幂等，在 Neon 上开箱支持

---

## MEDIUM — `scripts_created_by` FK 未设 onDelete 行为（数据悬挂风险）

**级别**: MEDIUM

**文件**: `drizzle/0001_clear_random.sql:52`

**问题**: `scripts_created_by_users_id_fk` 和 `scripts_reviewed_by_users_id_fk` 均为 `ON DELETE NO ACTION`。若员工账号被删除，`created_by` / `reviewed_by` 字段将指向已不存在的用户行（悬挂引用），且数据库不会报错。

**建议**: 根据业务需求选择 `ON DELETE SET NULL`（保留话术，作者置空）或 `ON DELETE RESTRICT`（不允许删除有话术记录的用户）。当前 MVP 阶段 `NO ACTION` 不会引发立即 bug（Neon PG 默认为延迟检查），但应在 service 层删用户前加保护。

---

## LOW — `idx_script_copy_logs_script` 未使用 DESC 排序

**级别**: LOW

**文件**: `drizzle/0001_clear_random.sql:63`

**说明**: README §3.4 定义 `CREATE INDEX ... ON script_copy_logs(script_id, copied_at DESC)`，但迁移 SQL 生成为 `USING btree ("script_id","copied_at")`（默认 ASC）。对于"最近复制记录"的典型降序查询，ASC 索引仍可扫描但效率略低。Drizzle ORM 目前对 `index().on().desc()` 支持有限，可接受，但建议评估时注意。

---

## LOW — `check` 约束未在 Drizzle schema 对应索引声明中体现 trgm 索引

**级别**: LOW

**文件**: `lib/db/schema/scripts.ts`

**说明**: `scripts.ts` 中仅有 4 个索引定义（`idx_scripts_tenant_status`、`idx_scripts_source`、`idx_scripts_knowledge`、`check`），两个 `gin_trgm` 索引没有在 Drizzle schema 文件内声明（只在迁移 SQL 中出现）。这意味着 `drizzle-kit push` 或未来迁移 diff 时可能认为这两个索引是"游离"索引并尝试删除。应在 `scripts.ts` 内用 `index(...).using("gin").on(...)` 声明，或通过 `sql` 自定义声明保持 schema 与迁移文件同步。（此问题出在上游 `scripts.ts` 而非 `index.ts` 本身，在此一并记录。）
