### 判定: PASS

# unit03 代码审查 — `lib/db/schema/script-tag-relations.ts`

审查维度：多对多设计（复合 PK / FK onDelete 策略 / 索引）

---

## 摘要

| 严重级别 | 数量 |
|----------|------|
| CRITICAL | 0    |
| HIGH     | 0    |
| MEDIUM   | 0    |
| LOW      | 1    |

---

## 无问题项

### 复合主键
`primaryKey({ name: "script_tag_relations_pkey", columns: [table.scriptId, table.tagId] })` — 显式命名，列顺序以 `script_id` 为前缀，有利于按 script 查询走主键，符合多对多表最佳实践。

### FK onDelete 策略
- `scriptId` → `scripts.id` 使用 `onDelete: "cascade"`：话术被删除时关联记录自动清除，正确。
- `tagId` → `scriptTags.id` 使用 `onDelete: "restrict"`：阻止删除仍被引用的标签，与 README §3.3 和 §6.4（停用标签后"已关联话术不丢标签"）一致。需注意：管理端删除标签实际是软删（`is_active=false`），不会触发 RESTRICT，逻辑正确。

### 索引
`idx_script_tag_relations_tag` 覆盖 `tag_id` 列，支持"按标签过滤话术"的反向查询，满足 README §3.3 设计要求。主键本身覆盖了 `(script_id, tag_id)` 的正向查询。

---

## LOW — 缺少 `scriptId` 侧独立索引（性能建议，非阻塞）

**级别**: LOW

**文件**: `lib/db/schema/script-tag-relations.ts`

**说明**: 复合主键 `(script_id, tag_id)` 已隐式覆盖"按 `script_id` 过滤"查询，无需单独索引。反向（`tag_id`）侧已有显式索引 `idx_script_tag_relations_tag`。设计已完整，无遗漏。

（此条目为确认说明，不是问题。）

---

## 与 README §3.3 对比

| README 要求 | 实现状态 |
|---|---|
| `PRIMARY KEY (script_id, tag_id)` | ✓ 命名复合 PK |
| `ON DELETE CASCADE` (script_id) | ✓ |
| `ON DELETE RESTRICT` (tag_id) | ✓ |
| `CREATE INDEX idx_script_tag_relations_tag ON ... (tag_id)` | ✓ |

完全对齐。
