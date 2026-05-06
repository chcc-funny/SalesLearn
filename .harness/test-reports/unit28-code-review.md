### 判定: PASS

**审查范围**：`components/scripts/script-filters.tsx` + `components/scripts/script-list.tsx` + 对应测试

---

## a11y（无障碍）

所有标签按钮均有 `aria-pressed`（布尔值），符合 WAI-ARIA togglebutton 规范。"全部"按钮也有 `aria-pressed`，在无标签选中时为 true，有选中时为 false。
搜索输入框有 `aria-label="搜索话术"`，排序通过 `<label>` 包裹 `<select>` 实现关联。
error 区域有 `role="alert"`（在 `ScriptList` 中）。

键盘交互：使用原生 `<button>` 和 `<select>`，Tab/Enter/Space 均可用，无需额外键盘处理。

## 不可变更新

`toggleId` 函数返回新数组（用 `filter`/spread），不修改 `list` 引用。`update()` 用 `{ ...value, ...patch }` 展开，不修改 `props.value`。测试用例"不可变更新：原 value.sceneTagIds 数组未被修改"明确覆盖此路径。

## loading/empty/error 三态

`ScriptList` 的优先级：`isLoading > error > empty > data`，符合"请求中不闪报错"的体验预期。三态均有对应测试用例，error 态有 `role="alert"` 方便辅助技术感知。

## 测试质量

- 全部使用 `userEvent`（非 `fireEvent`），符合测试最佳实践。
- 覆盖：基础渲染、受控状态、交互（添加/移除/清空）、不可变性、空选项防御、三态切换、onCopy 透传、管理端 badge。
- 测试结构清晰，断言具体。

---

## 无 CRITICAL/HIGH 问题

**MEDIUM**（1 项）：`ScriptFilters` 的 loading 态无对应 loading UI（组件本身是纯受控展示层，loading 态交给调用方的 `ScriptList` 处理），架构上合理，但在极端场景（标签和列表同时加载时）标签区会显示空状态而非 loading，可考虑在调用方补充 `ScriptFilters` 的禁用/skeleton 态。

**LOW**（1 项）：`ScriptFilters` 中排序 `<select>` 没有 `aria-label`（依靠外层 `<label>` 包裹实现关联），但包裹方式是合法的关联写法，不构成 a11y 缺陷。

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 1     | info   |
| LOW      | 1     | note   |

Verdict: PASS — 无 CRITICAL/HIGH 问题，可合并。
