### 判定: PASS

**审查单元**: unit27 — ScriptCard 卡片组件 + 单元测试

**文件**:
- `components/scripts/script-card.tsx`
- `tests/unit/script-card.test.tsx`

---

## 组件实现

**a11y / 语义**: 根容器 `<Card>` 设有 `role="article"` 和 `aria-labelledby={script-card-title-${script.id}}`，`<CardTitle>` 带对应 `id`，屏读器可正确关联标题。复制按钮有具体 `aria-label="复制话术「${script.title}」"` 而非泛泛的"复制"，`<Copy>` 图标设 `aria-hidden="true"` 防止图标被单独朗读。a11y 实现完整。

**键盘导航**: `<Button>` 使用 `type="button"` 和 `disabled={disabled}` 原生属性，原生按钮天然支持 Enter/Space 触发及 Tab 焦点，无需额外处理。

**XSS 防护**: 组件未使用 `dangerouslySetInnerHTML`，所有用户内容（`script.title`、`script.customerQuestion`、`script.answer`、`tag.name`）均通过 JSX 文本节点渲染，React 自动 HTML 转义，无 XSS 风险。

**onCopy 回调签名**: `onCopy?: (script: ScriptCardData) => void`，点击时调用 `onCopy?.(script)` 传入完整 script 对象，调用方可取 `script.id` / `script.answer` 等任意字段，签名合理且可选。`disabled=true` 时 `handleCopy` 提前 return，不调用回调，逻辑正确。

**多行截断 CSS**: `line-clamp-2` 用于标题和客户问题，`line-clamp-3` 用于答案，均为 TailwindCSS 标准工具类（`@tailwindcss/line-clamp` 在 Tailwind v3.3+ 内置），CSS 实现正确。

**不可变性**: 组件为纯展示，通过 `.filter()` 衍生 `sceneTags` / `productTags`，未修改 `script.tags`，符合不可变原则。

---

## 测试质量

**渲染覆盖**: 标题、客户问题、答案预览、usageCount（含 0）均有独立用例。

**标签覆盖**: 场景+产品全有、无标签、仅场景、仅产品四种组合均覆盖。

**状态徽章覆盖**: 5 个状态（draft / pending_review / published / rejected / archived）全部覆盖；且验证了 `showStatusBadge` 默认隐藏的员工端语义。

**交互覆盖**: onCopy 触发并携带 script 对象、不传 onCopy 不抛错、`disabled` 时按钮 `toBeDisabled()` 且回调不调用，三个交互路径均覆盖。

**a11y 测试**: `getByRole("article")` 验证语义容器、`getByRole("button", { name: /复制/ })` 验证按钮 aria-label，均有对应用例。

**fireEvent vs userEvent**: 使用 `fireEvent.click`，项目规范建议优先 `userEvent`。但对于禁用按钮断言（`expect(btn).toBeDisabled()` + `expect(onCopy).not.toHaveBeenCalled()`），`fireEvent` 与 `userEvent` 行为差异在此场景仅影响事件队列，结果一致。这是 MEDIUM 级别的测试规范问题，不影响正确性。

---

## 发现

[MEDIUM] 测试文件全部使用 `fireEvent` 而非 `userEvent`（`@testing-library/user-event`）。项目规范（coding-style 审查维度）要求优先使用 `userEvent`，后者更贴近真实用户交互（如 focus/blur、pointer events），特别对 `disabled` 按钮点击行为模拟更准确。建议后续统一为 `userEvent`。
文件: `tests/unit/script-card.test.tsx`

[LOW] 缺少键盘触发（Enter/Space）复制按钮的测试用例。当前只测鼠标点击，键盘导航路径未覆盖。

---

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 1     |
| LOW      | 1     |

Verdict: PASS — MEDIUM 问题（fireEvent vs userEvent）不影响当前正确性，可在后续规范化迭代中修复。
