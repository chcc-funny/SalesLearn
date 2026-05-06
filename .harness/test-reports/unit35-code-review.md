### 判定: PASS

**审查范围**
- `app/(admin)/admin/knowledge/[id]/page.tsx`（「标记为精选话术」按钮 + `handleMarkAsScript`）
- `app/(admin)/admin/scripts/page.tsx`（STATUS_MAP Object.fromEntries 顺手修）

---

**改动幅度评估**

`knowledge/[id]/page.tsx` 属于新文件（`??` 状态），完整实现了知识点详情页兼审核页，包含：行内编辑、分类选择、dirty 检测、beforeunload 拦截、驳回/发布 AlertDialog、固定底栏。「标记为精选话术」功能作为其中一个按钮，改动幅度与功能定位匹配，没有过度侵入。

---

**[LOW] `handleMarkAsScript` 未检查 HTTP 状态码**

`knowledge/[id]/page.tsx:116-137`，`fetch` 成功后仅依赖 `json.success` 判断结果，未检查 `res.ok`（如 503 时 body 可能不是合法 JSON，直接 `res.json()` 会抛异常但被 catch 捕获 → toast "网络异常"，行为可接受但不精确）。与同文件 `handleSave`、`fetchData` 一致，属于全局模式，不单独算问题。

**[LOW] toast action 跳转行为正确，但无视觉提示「已存在」场景**

`toast.success("已生成 draft 话术", { action: { label: "前往管理", onClick: () => router.push("/admin/scripts") } })` 正确。但若后端对同一 `knowledgeId` 重复调用返回幂等结果而非报错，用户多次点击会每次弹成功 toast，体验略奇怪。这属于后端幂等策略问题，前端处理合理，记录供参考。

**[LOW] `isMarkingScript` 状态未在 dirty 计算中考虑**

`handleMarkAsScript` 执行期间按钮已 `disabled={isMarkingScript || isSaving}`，防止重复触发，正确。但 `beforeunload` 只依赖 `dirty`，不依赖 `isMarkingScript`；如果用户在「生成中」时关闭标签页，不会有任何阻拦提示。影响面很小（生成是后端操作，关闭不会丢数据），可接受。

---

**STATUS_MAP Object.fromEntries 顺手修：已落地**

`app/(admin)/admin/scripts/page.tsx:92-97`：

```ts
const STATUS_MAP: Record<...> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, { label: s.label, variant: s.variant }])
);
```

改写已正确落地，单一数据源，STATUS_OPTIONS 变更自动同步到 STATUS_MAP，无重复维护负担。

---

**亮点**
- `handleMarkAsScript` 错误处理完整：try-catch + toast.error + finally 释放 loading 态。
- 按钮 `aria-label="标记为精选话术"` 有，disabled 状态（`isMarkingScript || isSaving`）防止并发调用，正确。
- toast action 跳转到 `/admin/scripts` 符合需求，路径正确。
- dirty 检测用 JSON.stringify 对比（immutable snapshot），不修改 original/draft，符合不可变原则。
