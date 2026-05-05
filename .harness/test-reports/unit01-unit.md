### 判定: PASS

smoke 测试通过：`lib/db/schema/scripts.ts` 模块成功导入。

**实际导出名（与初始模板差异已在测试中调整）：**
- `scripts` (表对象，对应 PG 表 `scripts`)
- `Script` (类型 = `typeof scripts.$inferSelect`)
- `NewScript` (类型 = `typeof scripts.$inferInsert`)
- `scriptStatuses` / `ScriptStatus`
- `scriptSources` / `ScriptSource`

**测试文件：** `tests/unit/_harness-batch1-schemas.test.ts`
**命令：** `pnpm vitest run tests/unit/_harness-batch1-schemas.test.ts`
**结果：** 1 file passed, 3 tests passed (含本 unit 的 1 个 smoke 用例)
**耗时：** 507ms

**说明：** 该批为 Drizzle 声明式 schema，按特殊说明不要求覆盖率。Vitest coverage 配置已显式排除 `lib/db/schema/**`。模块导入无运行时副作用错误，类型声明完整，表对象结构合法（含 PK/FK/index/check 约束）。
