### 判定: PASS

# unit06 — `seedScriptTags` 函数单元测试

- 测试文件: `tests/unit/_harness-batch2-schemas.test.ts`
- 命令: `pnpm vitest run tests/unit/_harness-batch2-schemas.test.ts`
- 结果: 5 passed / 0 failed
- 耗时: ~0.58s

## 覆盖点
- `lib/db/seed-script-tags.ts` 导出的 `seedScriptTags` 可被 import 且类型为 function（用例：`seedScriptTags is importable as a function (not executed)`）
- 同文件 helper `buildInitialScriptTags` 也能正常 import（用于未来纯函数级测试的入口验证）

## 未执行项（按任务约定）
- 不实际执行 `seedScriptTags(db, tenantId)`，避免触达 Neon 数据库
- 未对 `INITIAL_SCENE_TAGS` / `INITIAL_PRODUCT_TAGS` 内容、`onConflictDoNothing` 行为进行运行时断言（属于集成测试范围）

## 备注
- seed 函数为幂等设计，依赖 `(tenant_id, group_key, name)` UNIQUE 约束 + `onConflictDoNothing`；后续如需更高保真度，应放到 integration 层用真 db 或 mock client 验证。
