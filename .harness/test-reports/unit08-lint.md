### 判定: PASS

# Unit08 Lint Report — lib/validations/script-tag.ts

## 范围
- lib/validations/script-tag.ts

## 工具与命令
- ESLint：`npx next lint --file lib/validations/script-tag.ts`
- Prettier：`npx prettier --check lib/validations/script-tag.ts`

## 结果

### ESLint
- 输出：`✔ No ESLint warnings or errors`
- error 数：0
- warning 数：0

### Prettier
- 输出：`[warn] lib/validations/script-tag.ts`，`Code style issues found in the above file. Run Prettier with --write to fix.`
- error 数：0
- warning 数：1（格式风格建议，非阻断）

## 判定说明
ESLint 0 error 0 warning。Prettier 仅产生 `[warn]` 级别提示，按规则「warning 不算 FAIL，只 error 算」，故判定 PASS。

## 建议（非阻断）
- 可执行 `npx prettier --write lib/validations/script-tag.ts` 统一格式。
