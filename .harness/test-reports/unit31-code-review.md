### 判定: PASS

**审查目标**: `components/admin/scripts/script-form.tsx` + `tests/unit/script-form.test.tsx`

---

## 审查结果

### useState + zod safeParse 设计

合理。项目其他表单（KnowledgeForm）同样采用受控 useState 风格，保持一致。zod safeParse 兜底仅作为第二道校验，主逻辑由手写 errs 先行拦截，避免 zod 错误信息直接暴露。`source` 字段在 create 校验中硬编码为 `'curated'` 以跑通 schema，父页面提交时再补齐，设计说明清晰。相比引入 react-hook-form，降低依赖复杂度，对于当前场景是合理取舍。

### a11y

- `title` / `customerQuestion` / `answer`：`<Label htmlFor>` 与 `id` 正确关联，`aria-invalid` + `aria-describedby` 完整。
- 状态 radio：内联 `<label>` 包裹 `<input type="radio">`，可访问。
- 标签 toggle 按钮：`aria-pressed` 正确表达选中态，`type="button"` 避免意外 submit。
- 场景/产品标签组使用 `<fieldset>` + `<legend>`，语义正确。

### 不可变更新（标签多选）

`mergeInitial` 中对 `sceneTagIds` / `productTagIds` 做了 `[...initial.sceneTagIds]` 深拷贝，`toggleId` 返回新数组不修改原数组。测试 `initialValues.sceneTagIds 不被原地修改` 明确验证此行为，设计正确。

### mode='create'|'edit' 切换

按钮文案、submit label、zod schema 选择均正确区分两种模式。edit 模式下 `initialValues` 通过 `mergeInitial` 深拷贝注入，不污染外部引用。

### 测试覆盖

覆盖 a11y、受控输入、标签 toggle、不可变性、initialValues 注入、校验失败、isSubmitting、onCancel，覆盖率充分。

---

## 发现问题

无 CRITICAL / HIGH 问题。

**[LOW]** edit 模式下 `validate()` 调用 `updateScriptSchema.safeParse` 时未传 `status`（该 schema 可能不含 status 字段，符合预期），但注释说明「edit 不暴露 status 字段」与表单实际显示 status 选择器存在概念轻微出入。纯文档一致性问题，不影响行为。

**[LOW]** `isSubmitting` 为 true 时按钮文案为「创建中...」/「保存中...」，但测试中 `getByRole("button", { name: /创建|提交|保存中/ })` 写法可匹配，稍显宽松。建议测试精准匹配「创建中」避免误报，不阻塞合并。

---

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 2     | note   |

Verdict: PASS — 无阻塞性问题，可合并。
