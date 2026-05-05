### 判定: PASS

## Unit13 Lint 报告

**目标文件**：
- `lib/services/scripts/copy.ts`
- `tests/unit/scripts-copy-service.test.ts`

### ESLint
- 命令：`npx next lint --file lib/services/scripts/copy.ts --file tests/unit/scripts-copy-service.test.ts`
- 结果：`✔ No ESLint warnings or errors`
- 错误数：0
- 警告数：0

### Prettier
- 命令：`npx prettier --check lib/services/scripts/copy.ts tests/unit/scripts-copy-service.test.ts`
- 结果：2 个文件存在格式差异（项目未配置 `.prettierrc`，全部为 `[warn]` 级别）
  - `lib/services/scripts/copy.ts`
  - `tests/unit/scripts-copy-service.test.ts`
- 错误数：0
- 警告数：2（不计入 FAIL）

### 结论
ESLint 0 错误 0 警告；Prettier 仅 warn 级别格式差异，按规则不算 FAIL。判定 PASS。
