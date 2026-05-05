### 判定: PASS

# unit47 — 验证 page.tsx 仍能 import

## 任务
unit47 无独立测试文件，仅验证 `app/(employee)/scripts/page.tsx` 仍能正确 import / 类型通过 / 不破坏现有依赖图。

## 验证手段
1. `pnpm tsc --noEmit -p tsconfig.json`（项目配置）— 过滤 `scripts/page` 与 `generate-dialog` 相关错误：无输出（即无类型错误）。
2. 全量 vitest 回归：`pnpm vitest run` → 79 Test Files / 1057 passed / 1 skipped，无导入失败、无 transform 错误。
3. 已通过 unit46（17 个 GenerateDialog 测试）间接验证 `@/components/scripts/generate-dialog` 模块可正常被 page.tsx 导入消费（同 export 名 `GenerateDialog`）。

## 结论
`app/(employee)/scripts/page.tsx` import 链路完好，未发生破坏。
