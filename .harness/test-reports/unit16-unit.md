### 判定: PASS

## 测试目标
unit16: app/api/scripts/[id]/route.ts — GET handler 模块导入与导出 smoke 验证。

## 执行
- 新建 `tests/unit/_harness-batch6-routes.test.ts`，沿用 batch5 的依赖 mock 模式
- mock：`@/lib/db`、`@/lib/auth/guard`（透传 handler）、`@/lib/services/scripts/repository`、`@/lib/services/scripts/copy`、`@/lib/rate-limit`
- 用例：`import("@/app/api/scripts/[id]/route")` → 验证 `mod.GET` 存在且为 function
- 命令：`pnpm vitest run tests/unit/_harness-batch6-routes.test.ts`

## 结果
- Test Files: 1 passed
- Tests: 3 passed
- Duration: 322ms
- 全量回归 `pnpm vitest run`: 53 files / 658 passed / 1 skipped，无回归
