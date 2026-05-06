### 判定: PASS

smoke 测试通过：`lib/db/schema/script-tags.ts` 模块成功导入。

**实际导出名（与初始模板差异已在测试中调整）：**
- `scriptTags` (表对象，对应 PG 表 `script_tags`)
- `ScriptTag` (类型 = `typeof scriptTags.$inferSelect`)
- `NewScriptTag` (类型 = `typeof scriptTags.$inferInsert`)
- `scriptTagGroupKeys` / `ScriptTagGroupKey` (常量元组 + 联合类型: `"scene" | "product"`)

**测试文件：** `tests/unit/_harness-batch1-schemas.test.ts`
**命令：** `pnpm vitest run tests/unit/_harness-batch1-schemas.test.ts`
**结果：** 1 file passed, 3 tests passed (含本 unit 的 1 个 smoke 用例)
**耗时：** 507ms

**说明：** 该批为 Drizzle 声明式 schema，按特殊说明不要求覆盖率。模块导入无运行时副作用错误。表结构合法（含 unique 约束 `tenant_id+group_key+name`、复合索引 `tenant_id+group_key+is_active`）。
