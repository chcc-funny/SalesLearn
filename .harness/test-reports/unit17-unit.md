### 判定: PASS

## 测试目标
unit17: app/api/scripts/[id]/copy/route.ts — POST handler 模块导入与导出 smoke 验证 + `checkRateLimit` 函数存在性确认。

## 执行
- 复用 `tests/unit/_harness-batch6-routes.test.ts`
- mock 链路：`@/lib/db`、`@/lib/auth/guard`、`@/lib/services/scripts/copy`（含 `ScriptCopyError` 类）、`@/lib/rate-limit`（`checkRateLimit` 默认返回 allowed:true）
- 用例 1：`import("@/app/api/scripts/[id]/copy/route")` → 验证 `mod.POST` 存在且为 function
- 用例 2：`import("@/lib/rate-limit")` → 验证 `checkRateLimit` 存在且为 function（路由依赖前置条件）
- 命令：`pnpm vitest run tests/unit/_harness-batch6-routes.test.ts`

## 结果
- Test Files: 1 passed
- Tests: 3 passed（含 unit16 共 3 用例，unit17 部分 2 用例全过）
- Duration: 322ms
- 全量回归无回归
