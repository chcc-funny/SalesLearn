### 判定: PASS

# unit03 — `script-tag-relations` schema 单元测试

- 测试文件: `tests/unit/_harness-batch2-schemas.test.ts`
- 命令: `pnpm vitest run tests/unit/_harness-batch2-schemas.test.ts`
- 结果: 5 passed / 0 failed
- 耗时: ~0.58s

## 覆盖点
- `lib/db/schema/script-tag-relations.ts` 导出的 `scriptTagRelations` 表对象存在且为 object（用例：`script-tag-relations module exports the table object`）
- 通过 schema barrel `lib/db/schema/index.ts` 也能拿到 `scriptTagRelations`（用例：`schema barrel re-exports the 4 new script tables`）

## 备注
- schema 为声明式定义，覆盖率指标不强求；用例为 import smoke 性质，验证模块结构正确导出。
- 表结构（uuid 复合主键 `(scriptId, tagId)`、`tag_id` 索引、级联策略）由 drizzle 0001 迁移 SQL 在 unit05 报告中校验。
