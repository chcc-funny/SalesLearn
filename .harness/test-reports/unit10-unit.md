### 判定: PASS

## 单元
- unit10: `lib/services/scripts/state-machine.ts`

## 测试
- 文件: `tests/unit/script-state-machine.test.ts`（已有）
- 命令: `pnpm vitest run tests/unit/script-state-machine.test.ts --coverage --coverage.include='lib/services/scripts/state-machine.ts'`
- 结果: 28/28 用例通过（Test Files 1 passed / Tests 28 passed）

## 覆盖率（强制 ≥ 80%，已远超阈值）
- Statements: **100%** (12/12)
- Branches:   **100%** (4/4)
- Functions:  **100%** (4/4)
- Lines:      **100%** (11/11)

## 用例分组（来自现有测试）
- `canTransition`: draft/pending_review/published/rejected/archived 多向合法与非法迁移用例
- `assertTransition`: 合法迁移不抛错；非法迁移抛 `ScriptStateTransitionError` 并带可读信息
- `getAllowedNextStates`: 对每个起始状态返回正确的下一步集合
- `ScriptStateTransitionError`: 错误类型、name、message 校验

## 问题
- 无

## 备注
- 未修改源码或测试，按要求仅运行验证
- 覆盖率 100%，明显高于 80% 门槛
