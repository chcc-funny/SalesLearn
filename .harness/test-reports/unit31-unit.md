### 判定: PASS

## unit31 - ScriptForm 表单组件单元测试

**测试文件**: `tests/unit/script-form.test.tsx`
**目标组件**: `components/admin/scripts/script-form.tsx`

## 用例结果

- Test Files: 1 passed (1)
- Tests: 23 passed (23)
- Duration: ~0.87s

覆盖 23 个用例：受控状态（title/customerQuestion/answer）、场景/产品标签多选 toggle 不可变更新、status 切换 draft/published（默认 draft）、mode='create'/'edit' 文案 + initialValues 注入、提交/校验/a11y/isSubmitting 透传/onCancel。

## 覆盖率（聚焦 script-form.tsx）

```
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Lines
script-form.tsx  |  81.96  |  74.66   |   95    |  83.33  | ...,149,171-181,364
```

- Statements: 81.96% (50/61) >= 80% ✓
- Branches:  74.66% (56/75)
- Functions: 95% (19/20) >= 80% ✓
- Lines:     83.33% (45/54) >= 80% ✓

阈值 ≥ 80%（语句/行/函数）已满足。分支 74.66% 略低，主要为表单极少分支兜底（部分校验降级路径）。

## 全量回归

- Test Files: 66 passed (66)
- Tests: 863 passed | 1 skipped (864)
- Duration: 5.76s

无新增失败。

## 结论

PASS — 单元测试 23/23 通过，目标组件覆盖率达标，全量回归通过。
