### 判定: PASS

smoke 测试通过：`lib/db/schema/script-copy-logs.ts` 模块成功导入。

**实际导出名（与初始模板差异已在测试中调整）：**
- `scriptCopyLogs` (表对象，对应 PG 表 `script_copy_logs`)
- `ScriptCopyLog` (类型 = `typeof scriptCopyLogs.$inferSelect`)
- `NewScriptCopyLog` (类型 = `typeof scriptCopyLogs.$inferInsert`)

**测试文件：** `tests/unit/_harness-batch1-schemas.test.ts`
**命令：** `pnpm vitest run tests/unit/_harness-batch1-schemas.test.ts`
**结果：** 1 file passed, 3 tests passed (含本 unit 的 1 个 smoke 用例)
**耗时：** 507ms

**说明：** 该批为 Drizzle 声明式 schema，按特殊说明不要求覆盖率。模块导入无运行时副作用错误。表结构合法：使用 `bigserial` 主键、对 `scripts.id` 级联删除外键、对 `users.id` 受限外键、含两个复合索引（`script_id+copied_at`、`user_id+copied_at`），符合追加日志型表的典型设计。
