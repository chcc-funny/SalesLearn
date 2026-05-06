### 判定: PASS

## unit33 - 管理端话术 新建/编辑页 smoke test

**目标页面**:
- `app/(admin)/admin/scripts/new/page.tsx`（新建）
- `app/(admin)/admin/scripts/[id]/edit/page.tsx`（编辑）

**Smoke Test**: `tests/unit/_harness-batch11-pages.test.tsx`

## 测试策略说明

新建/编辑页主要复用 ScriptForm（unit31 覆盖），页面层组合（数据加载、提交、跳转、错误处理）由 E2E 验证；此处单元层 smoke test 仅验证 page 可被 import 且默认导出为 function 组件。

## 用例结果

- Test Files: 1 passed (1)
- Tests: 3 passed (3) — 含 new + edit 两个 page
- 断言：
  - `typeof ScriptNewPage === "function"` ✓
  - `typeof ScriptEditPage === "function"` ✓

## 全量回归

- Test Files: 66 passed (66)
- Tests: 863 passed | 1 skipped (864)
- Duration: 5.76s

## 结论

PASS — 新建页与编辑页均可正常 import，默认导出均为 React 函数组件，全量回归无影响。完整页面流程（含 ScriptForm 集成）由 ScriptForm 单元测试 + E2E 用例覆盖。
