### 判定: PASS

# unit06 代码审查 — `lib/db/seed-script-tags.ts` + `lib/db/seed.ts` 修改

审查维度：幂等性 / 数据与 README 对齐 / 参数化安全 / SQL 注入风险

---

## 摘要

| 严重级别 | 数量 |
|----------|------|
| CRITICAL | 0    |
| HIGH     | 0    |
| MEDIUM   | 0    |
| LOW      | 2    |

---

## 幂等性

### `onConflictDoNothing` 目标列
```typescript
await db.insert(scriptTags).values(rows).onConflictDoNothing({
  target: [scriptTags.tenantId, scriptTags.groupKey, scriptTags.name],
});
```
精确指向 `uq_script_tags_tenant_group_name` 唯一约束的三列，与 `script-tags.ts` 中 `unique(...)` 声明完全一致。多次运行只跳过已存在行，不覆盖管理员后续编辑的 `sort_order`/`is_active`，符合幂等设计要求。

### `seed.ts` 集成路径
- 用户已存在时仍调用 `seedScriptTags`，保证补齐首次运行后新增的初始标签 ✓
- 用户不存在（全新数据库）时也在流程末尾调用 `seedScriptTags` ✓
- 错误处理：`seed()` 函数有顶层 `catch` + `process.exit(1)` ✓

---

## 数据与 README §3.5 对齐

| README §3.5 | `INITIAL_SCENE_TAGS` | 状态 |
|---|---|---|
| 价格异议 | ✓ | 对齐 |
| 产品对比 | ✓ | 对齐 |
| 信任建立 | ✓ | 对齐 |
| 促单逼定 | ✓ | 对齐 |
| 售后维保 | ✓ | 对齐 |
| 客户犹豫 | ✓ | 对齐 |
| 投诉处理 | ✓ | 对齐 |

| README §3.5 | `INITIAL_PRODUCT_TAGS` | 状态 |
|---|---|---|
| 隔热膜 | ✓ | 对齐 |
| 车衣 | ✓ | 对齐 |
| 镀晶 | ✓ | 对齐 |
| 改色膜 | ✓ | 对齐 |
| 内饰清洗 | ✓ | 对齐 |

场景标签 7 条、产品标签 5 条，完全与 README 一致。

---

## SQL 注入安全

`seedScriptTags` 全程通过 Drizzle ORM 构造查询：
- `tenantId` 作为函数参数传入，由调用方（`seed.ts`）从常量 `TENANT_ID = "00000000-..."` 提供，非用户输入
- 标签名称来自 `as const` 字面量数组，编译期固定，无运行时外部输入
- Drizzle `.values(rows)` 使用参数化绑定，不存在字符串拼接 SQL

**无 SQL 注入风险。**

---

## LOW — `tenantId` 参数未做 UUID 格式校验

**级别**: LOW

**文件**: `lib/db/seed-script-tags.ts:61`

**说明**: `seedScriptTags(db, tenantId: string)` 接受任意字符串作为 `tenantId`，若调用方传入非 UUID 格式字符串，Postgres 会在运行时抛出类型错误。当前 seed.ts 的调用方使用硬编码 UUID 常量，风险极低；但若该函数被其他场景（如 admin 工具）复用，建议在函数入口添加 UUID 格式断言或 Zod 校验。

---

## LOW — `NeonHttpDatabase<any>` 类型过宽

**级别**: LOW

**文件**: `lib/db/seed-script-tags.ts:63`

**说明**: 参数类型使用 `NeonHttpDatabase<any>` 并配有 `eslint-disable` 注释。建议改为 `NeonHttpDatabase<typeof import('./schema').schema>` 或项目统一的 `DbClient` 类型别名，使类型检查能覆盖 schema 引用正确性。当前实现仅限内部 seed 脚本，影响范围可控，属于 LOW 级建议。

---

## `seed.ts` 修改评估

| 修改点 | 评估 |
|---|---|
| 新增 `import { seedScriptTags }` | 正确，来自正确路径 |
| 用户已存在分支补调 `seedScriptTags` | 幂等补齐逻辑合理 |
| 全新分支末尾调用 `seedScriptTags` | 正确时序（用户/知识点/题目 → 标签） |
| 控制台输出含 attempted 数量 | 可观测，无敏感信息泄露 |
