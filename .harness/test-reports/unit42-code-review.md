### 判定: PASS

## unit42 — POST /api/scripts/generate

**文件**：`app/api/scripts/generate/route.ts` + `tests/integration/scripts-generate.test.ts`

---

### 审查结论

所有高优先级维度均通过，无 CRITICAL / HIGH 问题。

---

### 各维度核查

**1. try/catch 二次保护（修 Batch 14 MEDIUM）**

路由第 74-92 行对 `searchOrGenerateScripts` 整体包裹 try/catch，捕获任何未经 orchestrator 内部降级的错误，返回 HTTP 200 + `source='empty'` + `generateError`。设计合理：LLM 调用失败对用户呈现空态而非 5xx，且 `generateError` 字段明确区分正常空结果与降级空结果，前端可区分两种情况。集成测试覆盖了 Error 对象和非 Error 字符串两类抛出，验证充分。

**2. rate-limit 桶名**

key 为 `script-generate:user:${user.id}`，类型为 `"llm"`。前缀区分接口语义，user.id 隔离不同用户，不与 default（IP 级）桶串扰。测试断言 key 含 user id 且 type = 'llm'，覆盖完整。

**3. tenantId 不可被 body 覆盖**

`generateBodySchema` 只扩展了 `customerQuestion / sceneTagId / productTagId`，未声明 `tenantId`；调用 orchestrator 时 `tenantId: user.tenantId`（来自 session）。测试明确断言 `callArg.tenantId === 'tenant-1'`，安全。

**4. 校验覆盖**

覆盖：缺字段、超长、空串、非 UUID 标签 → 400；非法 JSON → 400；429 限流；401 黑盒契约。四种成功 source 场景（curated / generated / mixed / empty）均有测试。

---

### 低优先级备注（不阻塞）

- [LOW] orchestrator 异常时，`generateError` 会把内部错误消息直接透传给客户端（第 86-88 行）。当前为开发阶段，MVP 内部系统可接受；若后续开放 SaaS，建议过滤敏感信息（如数据库连接字符串）后再返回。

---

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 1     | note   |

**Verdict: PASS — 可合并。**
