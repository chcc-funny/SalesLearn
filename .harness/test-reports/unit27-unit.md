### 判定: PASS

## 单元: unit27 - script-card 组件单元测试

### 测试目标
- 文件: `tests/unit/script-card.test.tsx`
- 组件: `components/scripts/script-card.tsx` (188 行)
- 用例: 20 个

### 执行结果
- Test Files: 1 passed
- Tests: 20/20 passed
- 时长: ~44ms（局部）
- 全量回归: 61 files / 794 passed / 1 skipped / 0 failed

### 命令
```
pnpm vitest run tests/unit/script-card.test.tsx \
  --coverage --coverage.include='components/scripts/script-card.tsx'
```

### 覆盖率（components/scripts/script-card.tsx）

| 指标 | 数值 | 阈值 | 结果 |
|---|---|---|---|
| Statements | 92.85% (13/14) | ≥80% | PASS |
| Branches   | 90.00% (9/10)  | ≥80% | PASS |
| Functions  | 100% (6/6)     | ≥80% | PASS |
| Lines      | 100% (11/11)   | ≥80% | PASS |

未覆盖行: L108（极端分支）。

### 覆盖范围
- 渲染：标题、正文、标签、状态徽章
- 交互：点击复制 / 编辑 / 删除回调
- 状态变体：Draft / Published / Archived 视觉切换
- 边界：空标签、长文本截断、缺省 props
- 无障碍：role / aria-label

### 结论
20 用例全部通过，组件覆盖率全维度 ≥80%（最低 90%），符合质量门禁。
