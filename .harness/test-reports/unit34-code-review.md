### 判定: PASS

**审查范围**
- `components/admin/scripts/tag-manager.tsx`
- `app/(admin)/admin/scripts/tags/page.tsx`
- `tests/unit/tag-manager.test.tsx`

---

**[MEDIUM] 删除按钮无 confirm，测试与实现不一致**

组件 `tag-manager.tsx` 的删除按钮直接调用 `onDelete(tag.id)`，无任何确认拦截（设计上由父层负责）。`tags/page.tsx` 的 `handleDelete` 用 `window.confirm` 做软删确认，符合注释说明。

测试文件 `tag-manager.test.tsx:272-282` 在"删除（软删）"用例中，点击删除按钮后直接断言 `onDelete` 被调用，但 **未** mock `window.confirm`。若测试环境中 `window.confirm` 默认返回 `false`（jsdom 默认行为），此用例实际上是在测试"没有 confirm 的组件"——这与实际生产行为（confirm 由父层负责）完全一致，但注释里写着"软删 confirm"让人误以为组件层会弹窗。

建议：在测试或注释中明确说明 confirm 由 `tags/page.tsx` 负责，避免后续维护者在组件层加 confirm 造成双重弹窗。

**[LOW] `handleDelete` 使用 `window.confirm` 而非 AlertDialog**

`tags/page.tsx:158` 使用原生 `window.confirm`，而同项目的归档确认（`scripts/page.tsx`）和驳回确认（`knowledge/[id]/page.tsx`）都使用了 `AlertDialog`，风格不一致。`window.confirm` 在移动端 webview 中也可能被屏蔽。建议统一使用 `AlertDialog`。

**[LOW] `handleMove` 并发 sortOrder 相等兜底逻辑存在潜在歧义**

`tags/page.tsx:207-208`，当 `a.sortOrder === b.sortOrder` 时退化为用数组索引 (`idx` / `swapIdx`) 作为新序号。如果列表总数超过实际 sortOrder 最大值，退化值可能与其他标签重叠导致排序混乱。这是极低概率场景（正常情况 sortOrder 不会重复），但可加注释说明此为"数据异常时的最优尽力恢复"。

---

**亮点**
- `sortByOrder` 不可变排序（`[...tags].sort()`）正确。
- `useMemo` 分组不修改 `props.tags`，测试中"不可变性"用例有覆盖。
- a11y 实现完整：`fieldset`/`legend`、所有按钮有语义 `aria-label`、图标统一 `aria-hidden`、输入框有关联 `label`（`htmlFor`）。
- 测试覆盖全面（渲染、新建、编辑、删除、排序、loading、不可变性），用例数量充足。
- `tags/page.tsx` 错误处理完整，所有 fetch 有 try-catch + toast.error，setIsMutating 在 finally 释放。
