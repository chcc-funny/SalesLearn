### 判定: PASS

# unit13 - lib/services/scripts/copy.ts 单元测试

## 命令
```
pnpm vitest run tests/unit/scripts-copy-service.test.ts --coverage --coverage.include='lib/services/scripts/copy.ts'
```

## 结果
- Test Files: 1 passed
- Tests: 8 passed / 0 failed
- Duration: ~435ms

## 覆盖率（scope: lib/services/scripts/copy.ts）
| 指标 | 值 |
| --- | --- |
| Statements | 100% (11/11) |
| Branches | 100% (4/4) |
| Functions | 100% (3/3) |
| Lines | 100% (11/11) |

> 阈值要求 ≥ 80%，全部 100%，远超阈值。

## 用例清单
1. logScriptCopy - 成功路径
   - 命中 published 话术：自增 usage_count 并写日志
   - usage_count 自增使用 SQL 表达式（避免 select-then-update 竞态）
   - 传入 deviceInfo（可选）时不落库（v1 schema 仅 tenantId/scriptId/userId）
2. logScriptCopy - 失败路径
   - 非 published / 软删 / 不存在：UPDATE 0 行 → 抛 ScriptCopyError
   - UPDATE 0 行：不写 script_copy_logs
   - 跨租户：UPDATE 0 行 → 抛错，无副作用
3. logScriptCopy - 事务边界
   - 事务回调内 update + insert 都使用同一 tx 实例
4. ScriptCopyError
   - instanceof 跨编译目标维持

## 结论
unit13 全绿，覆盖率 100%（远超 80% 阈值），事务原子性、租户隔离、SQL 表达式自增、日志一致性均验证。
