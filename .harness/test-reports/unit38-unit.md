### 判定: PASS

## unit38 - tests/unit/scripts-rerank.test.ts

### 测试结果
- 测试文件: 1 passed
- 测试用例: 通过（全部 52 个用例中 unit38 部分全部通过）
- 全量回归: 71 files / 947 passed (1 skipped) - 0 失败

### 覆盖率（lib/services/scripts/rerank.ts）
| 指标 | 数值 | 阈值 | 状态 |
|---|---|---|---|
| Statements | 97.05% | ≥60% | PASS |
| Branches | 87.5% | - | - |
| Functions | 100% | - | - |
| Lines | 100% | ≥60% | PASS |

未覆盖行: 行 60、114、144（少量边界分支）

### 关键校验点
- 边界（不调 LLM）: 候选为空返回空、单一候选直接返回
- 成功路径: LLM 返回评分按降序、缺失候选保留原序追加、scene/product 透传到 prompt、score 超 [0,1] 范围被 clamp
- 降级: LLM 抛错回退原顺序 degraded=true、scores 非数组退化、data 为 null 退化
- LLM 调用参数: 使用 KIMI_K2 模型、temperature ≤0.3（确定性）

### 结论
unit38 PASS。覆盖率 97.05% statements / 100% lines，远超 60% 阈值。
