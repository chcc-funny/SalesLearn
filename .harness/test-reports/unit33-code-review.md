### 判定: PASS

**审查目标**: `app/(admin)/admin/scripts/new/page.tsx` + `app/(admin)/admin/scripts/[id]/edit/page.tsx`

---

## 审查结果

### 加载态 / 错误态（编辑页）

编辑页有完整三态：
- `isLoading=true` → 「加载中...」占位
- `loadError!=null` → `role="alert"` 错误文本
- `initialValues!=null` → 渲染 `ScriptForm`

新建页无需加载详情，标签拉取失败静默处理（不阻塞表单），设计合理。

### 提交后跳转

两个页面均在 `toast.success` 后执行 `router.push("/admin/scripts")` + `router.refresh()`，行为正确。`isSubmitting` 在 `finally` 中重置，防止按钮永久禁用。

### PUT 字段（编辑页）

`handleSubmit` 显式只传 `title / customerQuestion / answer / sceneTagIds / productTagIds`，不传 `status`。与注释说明「PUT schema 不接受 status，status 流转走 review/archive」一致，避免前端意外覆盖状态机。字段覆盖完整，无遗漏内容字段。

### status 字段处理（编辑页）

`deriveTagIds` 兼容两种 API 返回格式（`sceneTagIds` 数组 vs `tags[{groupKey}]`），防御性强。`status` 归一化为 `'published' | 'draft'`（非 published 统一降为 draft），与表单 `ScriptFormStatus` 类型匹配，安全。

### XSS 风险

`loadError` 为服务端返回的 `json.error ?? '...'` 字符串，通过 React 文本节点渲染（无 `dangerouslySetInnerHTML`），无 XSS 风险。`answer` 字段全程不做 HTML 渲染，PASS。

### SSRF 风险

两页均调用固定路径 `/api/scripts/:id` 和 `/api/admin/scripts/:id`，`id` 来自 `useParams`（Next.js 路由解析），不存在用户控制 URL 路径导致 SSRF 的情形。

### 沿用 admin/knowledge/* 风格

布局结构（`min-h-screen bg-background p-6` + `max-w-2xl mx-auto` + 顶部标题/返回按钮 + 内容卡片 `rounded-lg border bg-surface p-6`）与 knowledge edit 页一致。toast 提示、router 跳转模式相同。

### useEffect 取消

两页 `useEffect` 均通过 `cancelled` flag 防止组件卸载后 setState，无内存泄漏。

---

## 发现问题

无 CRITICAL / HIGH 问题。

**[MEDIUM]** 编辑页 `handleSubmit` 在 `if (!json.success)` 后 `return` 而未走到 `finally`？不对，`finally` 在 try-catch 内，`return` 不影响 `finally` 执行，`setIsSubmitting(false)` 会正确执行。——实为误判，无问题。

**[LOW]** 新建页标签拉取失败时静默忽略，与编辑页行为一致。建议统一加 toast 提示，让管理员知道标签为空是加载失败而非真的没有标签。

**[LOW]** 编辑页 `initialValues` 类型为 `Partial<ScriptFormValues> | null`，初始值为 `null`。当 `initialValues` 为 `null` 且 `isLoading=false` 且 `loadError=null` 时（正常情况不会发生，但逻辑上存在），渲染空白。可考虑加一个兜底提示，但属于防御性细节。

---

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 2     | note   |

Verdict: PASS — 无阻塞性问题，可合并。
