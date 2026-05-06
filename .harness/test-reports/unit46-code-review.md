### 判定: PASS

## unit46 — GenerateDialog 组件 + 单元测试

**文件**：`components/scripts/generate-dialog.tsx` + `tests/unit/generate-dialog.test.tsx`

---

### 审查结论

各维度均通过。无 CRITICAL/HIGH 问题。

---

### a11y

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby="generate-dialog-title"` 齐备（第 311-313 行）。
- 关闭按钮 `aria-label="关闭"` 正确（第 334 行）。
- Overlay 设 `aria-hidden="true"` 防屏幕阅读器误读（第 317 行）。
- `<label htmlFor="generate-dialog-question">` 与 `<Textarea id="generate-dialog-question">` 显式绑定，textarea 同时设 `aria-label`（冗余但无害）。
- Escape 关闭：`window.addEventListener("keydown", onKeyDown)` 仅在 open=true 时注册，close 时清除，无内存泄漏（第 221-228 行）。
- **焦点陷阱缺失**：弹窗打开时焦点未自动移入对话框内，Tab 键可逃出。这属于 a11y 最佳实践，但在 shadcn/ui 自定义实现中常见，且项目注释已说明"自己实现 overlay + Esc 监听 + 焦点回收"。当前版本的焦点回收只在 `open` 状态切换时重置 state，并未做 `focus()` 调用。[MEDIUM] 建议后续补充 `autoFocus` 或 `useEffect` 对 textarea 做初始 focus。

### XSS 防护

- `item.answer` 通过 `{item.answer}` 文本节点渲染（第 157 行），无 `dangerouslySetInnerHTML`。
- `item.title` 同样文本节点渲染（第 153 行）。
- 安全。

### 加载/错误/空态

- 加载中：按钮内显示 `<Loader2 animate-spin />` + "生成中..." 文案，按钮 disabled（第 396-403 行）。
- 错误（API success=false）：`toast.error` + 设 `result={source:"empty", items:[]}` → 渲染空态文案（第 246-248 行）。
- 网络异常：catch 后 `toast.error` + 同上空态（第 257-259 行）。
- 空态文案清晰（第 412-414 行）。
- 三态覆盖完整。

### Source Badge 视觉

- `isGenerated=true` → 琥珀色"AI 生成"徽标（第 111-114 行）。
- `source=curated|mixed` 且非 generated → 绿色"精选"徽标（第 117-121 行）。
- `source=generated` 且 `isGenerated=undefined` 时 badge 返回 null（第 124 行）——但 generated source 场景下 items 均为 `isGenerated=true`，实际不影响展示。

### 防重复提交

- `isSubmitting` state 在 `handleSubmit` 进入时设 true，finally 重置（第 276-303 行）。
- `CandidateCard` 的提交按钮 `disabled={isSubmitting}`（第 174 行）。
- 防重复点击正确。

### 不可变性

- `setResult({...})` 新对象替换，未直接修改 result（第 251-255 行）。
- `setQuestion`、`setIsLoading`、`setIsSubmitting` 均替换值，无 mutation。符合项目不可变要求。

---

### 测试质量

- 使用 `userEvent`（`@testing-library/user-event`），未使用 `fireEvent`。
- `mockFetch` 按 URL 分流，粒度合理（generate/submit 独立匹配）。
- 覆盖面：open=false / open=true / 超长 / 空输入 / curated / generated / mixed / empty / 加载中 / API success=false / 网络异常 / 复制不调 submit / 提交审核带 requestId + onSubmitted 回调 / 提交失败不调 onSubmitted / initialQuestion 预填。
- 共 15 个测试用例，覆盖率充分。
- `beforeEach(vi.clearAllMocks)` + `afterEach` 恢复 global.fetch，隔离良好。
- 加载态测试用 Promise 挂起再手动 resolve，正确模拟 pending 状态。

---

### 低优先级备注（不阻塞）

- [MEDIUM] 焦点陷阱缺失：弹窗打开时 Tab 可逃出。建议 `open` 变为 true 时对 textarea 调用 `.focus()`。
- [LOW] `genRequestId` 中 UUID v4 fallback 实现（第 88-96 行）的 bit 操作 `(Math.random() * 4) | (8 & 0xf)` 存在运算符优先级问题（`|` 低于 `&`，等价 `(Math.random() * 4) | 8`，结果固定为 8-11 范围），并非标准 v4 variant byte（应为 8、9、a、b），但对前端兜底 ID 的实际功能无影响（后端有自己的 requestId 校验）。
- [LOW] `handleSubmit` 中 `trimmed || item.customerQuestion`（第 283 行）：若用户在生成后清空了 textarea，customerQuestion 字段会回退到 item 上的原始值，属于合理降级。

---

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 1     | info   |
| LOW      | 2     | note   |

**Verdict: PASS — 可合并。焦点陷阱建议 Phase 2 补充。**
