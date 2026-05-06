### 判定: PASS

## 单元
- unit08: `lib/validations/script-tag.ts`（zod 校验，声明式）

## 测试
- 文件: `tests/unit/_harness-batch3-validations.test.ts`
- 命令: `pnpm vitest run tests/unit/_harness-batch3-validations.test.ts tests/unit/script-state-machine.test.ts --coverage`
- 结果: 全部通过（unit08 部分共 14 个用例）

## 用例覆盖（每个 schema ≥ 1 valid + 2 invalid）
- `createScriptTagSchema`: valid 默认 sortOrder/isActive；invalid 错误 groupKey；invalid name > 50；invalid 负 sortOrder
- `updateScriptTagSchema`: valid 单字段更新；invalid 空对象；invalid 非整数 sortOrder
- `listScriptTagsQuerySchema`: valid onlyActive 默认 true；valid `'false'` → false（绕开 z.coerce.boolean 陷阱）；valid `'1'` → true；invalid 错误 groupKey
- `sortScriptTagsSchema`: valid scene + 2 UUID；invalid 空 orderedIds；invalid 非 UUID id

## 覆盖率（zod 声明式不强制 80%，仅作记录）
- `lib/validations/script-tag.ts`: Stmts 87.5% / Funcs 100% / Lines 92.3% / Branch 66.66%
- 第 68 行未覆盖（queryBooleanSchema preprocess 中的 fallback `return val;`，正常输入下不进入）

## 问题
- 无

## 备注
- 验证了 `queryBooleanSchema` 自定义 preprocess 行为（不使用 `z.coerce.boolean`），关键边界 `'false'` 已覆盖
- 未修改任何源码，仅新增 smoke 测试
