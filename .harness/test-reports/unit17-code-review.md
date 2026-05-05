### 判定: PASS

**文件**: `app/api/scripts/[id]/copy/route.ts`

---

## 审查结论

无 CRITICAL / HIGH 问题。事务下沉、错误码语义、rate limit 分层均合理。

---

## 逐项分析

### 1. Rate Limit 实现合理性

实现分两层：
- middleware（IP 级，default 60/min）
- 此处（用户级，`script-copy:user:<userId>`，使用 `type="default"` 复用 60/min 桶）

**MEDIUM 问题**：注释声称「每用户每分钟 30 次」，但实际调用 `checkRateLimit(..., "default")` 使用的是 60/min 桶，并非 30。注释与代码不符，会误导后续开发者。若真要 30/min，需在 `RATE_LIMITS` 注册 `"script-copy"` 类型或直接传自定义 `maxTokens`。

**MEDIUM 问题**：`checkRateLimit` 使用进程内 `Map` 实现令牌桶。在 Vercel Serverless 环境中，每次冷启动（或并发多实例）各自持有独立 store，用户级限流实际上无法跨实例聚合，导致 30 次/分的约束形同虚设。这对 MVP 是可接受的权衡，但应在注释中明确说明（目前注释暗示生产有效）。

### 2. 事务是否下沉到 service

事务完全在 `lib/services/scripts/copy.ts` 的 `logScriptCopy` 中执行，API 层不涉及任何 DB 操作。原子性（自增 + 写日志）保证正确，符合项目分层原则。

### 3. 错误码语义

| 场景 | HTTP | ErrorCode | 评价 |
|------|------|-----------|------|
| 缺少 id | 400 | VALIDATION_ERROR | 正确 |
| ScriptCopyError（未发布/软删/跨租户） | 400 | VALIDATION_ERROR | 可接受；语义上 422 更准确，但项目统一用 400，一致 |
| 超频 | 429 | RATE_LIMITED | 正确 |
| 其他 DB 错误 | 500 | DATABASE_ERROR | 正确 |

`ScriptCopyError` 用 400 VALIDATION_ERROR 略偏（客户端并没有输入错误，而是业务前提不满足），但项目其他状态机错误也走同一路径，保持了一致性，不算高危。

### 4. 安全

- tenantId 来自 session，不接受客户端传参，正确防越权。
- 错误消息不泄露内部堆栈，正确。

---

## 问题清单

| 等级 | 位置 | 说明 |
|------|------|------|
| MEDIUM | route.ts:41 | 注释写"30 次/分"，实际传 "default"（60/min），注释与实现不符 |
| MEDIUM | lib/rate-limit.ts:26-27 | 进程内 Map 在 Serverless 多实例下无法跨实例聚合，用户级限流失效；建议注释中明确 MVP 局限性 |
