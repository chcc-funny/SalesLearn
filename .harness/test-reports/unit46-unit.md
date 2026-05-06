### 判定: PASS

# unit46 单元测试 — GenerateDialog 组件

## 测试文件
- `tests/unit/generate-dialog.test.tsx`

## 被测组件
- `components/scripts/generate-dialog.tsx`

## 命令
```
pnpm vitest run tests/unit/generate-dialog.test.tsx --coverage --coverage.include='components/scripts/generate-dialog.tsx'
```

## 用例数
- 17 个全部通过

## 覆盖范围（包括但不限于）
- 关闭/打开态渲染、a11y dialog role
- onClose（关闭按钮 + Escape）
- 输入校验（>500 字按钮禁用 + 错误提示；空输入禁用）
- 生成请求（curated / generated / mixed / empty 四个分支）
- loading 态按钮禁用 + 文案
- API success=false / fetch reject 时 toast.error
- 候选「复制」按钮：clipboard.writeText + 不调 submit
- 「提交审核」按钮：POST /api/scripts/submit、带 requestId、onSubmitted 回调
- 提交失败：toast.error 且不调 onSubmitted
- initialQuestion 预填

## 覆盖率（v8 provider）
| 指标 | 覆盖率 | 阈值 | 判定 |
|------|--------|------|------|
| Statements | 80.23% (69/86) | ≥ 80% | PASS |
| Branches | 73.61% (53/72) | — | OK（关键分支均覆盖，未覆盖为 console.error 错误兜底+剪贴板异常等边角逻辑）|
| Functions | 100% (16/16) | ≥ 80% | PASS |
| Lines | 85.52% (65/76) | ≥ 80% | PASS |

未覆盖行：88-96, 124, 271, 299（剪贴板 catch 分支与少量错误兜底路径）。

## 结论
GenerateDialog 组件单元测试 17/17 通过；语句/函数/行覆盖率全部超过 80% 阈值，达成 unit46 验收要求。
