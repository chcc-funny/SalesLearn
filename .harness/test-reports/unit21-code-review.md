### 判定: PASS

**审查对象**
- `app/api/admin/scripts/[id]/route.ts`
- `tests/integration/admin-scripts-update-delete.test.ts`

---

## 审查维度评估

### 1. 管理端鉴权（role !== 'employee'）
PUT 和 DELETE 均使用 `withAuth(..., ["manager"])` — 严格限制 manager 角色。  
员工调用两个端点均返回 403 + code=2002，测试断言完整。  
401 黑盒在末尾独立 describe，用 `vi.resetModules()` + `vi.doMock()` 重新 import 路由，同时覆盖 PUT / DELETE 两个端点，code=2001 断言正确。

### 2. 多租户隔离
PUT：`updateScript(user.tenantId, id, input)` — tenantId 来自 session，service 层 WHERE 包含 `tenant_id = ?`（见 repository.ts:279）。  
DELETE：`softDeleteScript(user.tenantId, id)` — 同上，WHERE 含 `tenant_id = ?`（repository.ts:378）。  
跨租户：即使 body 含 `tenantId: "tenant-attacker"` 字段，zod `updateScriptSchema` 不包含该字段（无 passthrough），Drizzle UPDATE 使用 `user.tenantId`，测试断言验证了 service 只收到 `"tenant-1"`。  
不存在 / 跨租户情形：service 返回 null → route 返回 404（而非泄露"跨租户"信息）。此设计正确。

### 3. 状态机
**PUT 阻断 status 变更**：`updateScriptSchema`（lib/validations/script.ts:77-90）不含 `status` 字段，zod 默认 strip 未知字段。即使 body 传 `status: "published"`，`parsed.data.status` 不存在，`input.status` 为 undefined，service 层不收到 status，状态机未被绕过。  
测试用例"PUT body 含 status 字段也不会被路由层透传"（第 206 行）直接断言 `input.status === undefined`，覆盖到位。

**DELETE softDelete 状态机**：`softDeleteScript` 仅设置 `deletedAt`，不改 status——符合注释"删除不改状态机"。  
注意：delete 操作不经过 `assertTransition`，意味着任意状态（draft/pending_review/rejected）均可被软删。这是产品设计决策，路由注释说明"状态保留不变"，无安全问题，但若业务规则要求"仅 archived 可删"则需要状态机校验。当前无相关业务规则，属 LOW 提示。

### 4. 集成测试质量
| 覆盖点（PUT） | 状态 |
|---|---|
| 更新基础字段 title | PASS |
| 更新标签 sceneTagIds + productTagIds | PASS |
| 更新 questionAliases / knowledgeId | PASS |
| 空 body → 400（refine 至少一字段） | PASS |
| title 超长 → 400 | PASS |
| 非法 UUID sceneTagIds → 400 | PASS |
| PUT body 含 status → service 不收到 | PASS |
| 话术不存在（service null）→ 404 | PASS |
| 缺 id → 400 | PASS |
| 员工 → 403 | PASS |
| DB 异常 → 500 | PASS |
| 非法 JSON → 400 | PASS |
| 跨租户注入安全 | PASS |

| 覆盖点（DELETE） | 状态 |
|---|---|
| 软删成功 → 200 + deleted=true | PASS |
| 不存在/跨租户 null → 404 | PASS |
| 缺 id → 400 | PASS |
| 员工 → 403 | PASS |
| DB 异常 → 500 | PASS |
| 401 黑盒（PUT + DELETE）| PASS |

### 5. 轻微注意事项（不阻断）

**[LOW]** `updateScriptSchema` 的 `.refine()` 检查 `Object.keys(data).length > 0`（lib/validations/script.ts:87-89）：Zod 在 strip 模式下，包含 unknown 字段如 `{ status: "published" }` 会被 strip 为 `{}`，导致 refine 报错 400 VALIDATION_ERROR，而不是静默忽略 status。测试用例"PUT body 含 status"传入 `{ title: "新标题", status: "published" }` — 含 `title` 合法字段，故 refine 通过。若 body 仅含 `{ status: "published" }` 则会返回 400，行为合理但与文档"多余字段被 zod 忽略"措辞略有出入（实际是"完全被 strip 后空对象触发 refine"）。不是 bug，但注释可更精确。

**[LOW]** `softDeleteScript` 不检查话术当前状态，可删除 `pending_review` 或 `published` 状态话术。若产品将来要求"已发布需先归档才能删除"，此处需加状态机校验。当前版本无此约束，标记供后续决策参考。

---

## 汇总

| 严重度 | 数量 | 状态 |
|---|---|---|
| CRITICAL | 0 | pass |
| HIGH | 0 | pass |
| MEDIUM | 0 | pass |
| LOW | 2 | note |

**结论：PASS，可合并。**
