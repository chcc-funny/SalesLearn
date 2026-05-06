### 判定: PASS

**审查单元**: unit25 — 管理端话术 CRUD 生命周期串联集成测试

**文件**: `tests/integration/admin-scripts-crud.test.ts`

---

## 生命周期串联

**in-memory store 隔离**: `resetStore()` 在每个 `beforeEach` 调用，`store.rows = []` 和 `store.seq = 0` 均重置，各用例之间状态完全隔离，无跨用例污染。

**store 不可变性**: `mockCreateScript` 使用 `store.rows = [...store.rows, row]`（扩展新数组），`mockUpdateScript` / `mockArchiveScript` / `mockSoftDeleteScript` 均使用 `store.rows.map(...)` 返回新数组赋值，全程无数组 `.push()` / `.splice()` 等就地修改，符合不可变模式要求。

**跨租户用例**: 生命周期 #7 明确切换 `currentUser.tenantId = "tenant-2"`，验证列表为空 + archive 越权 → 404 + PUT 越权 → 404，跨租户隔离覆盖完整。

**状态机非法跳转**: 生命周期 #3（archived → archived）和生命周期 #4（draft → archived）均覆盖，断言 400 + 错误码 1001 + 错误消息关键字，与 `ScriptStateTransitionError` mock 对齐。

**软删后的二次操作**: 生命周期 #5 验证：DELETE 成功 → list 不可见 → 二次 DELETE 返回 404 → PUT 也返回 404，覆盖了 `findRow` 在 `deletedAt !== null` 时返回 `undefined` 的联动效果。

**状态覆盖宽度**: 6 条串联用例从 create(draft) / create(published) 入口出发，串联 update / archive / softDelete，并通过 `LIST` 端点验证状态变化可见性，CRUD 四个方向全部串联。

**可复用度**: helper 函数（`listReq` / `postReq` / `putReq` / `deleteReq` / `ctx`）和 `makeManager` 风格的 `mockManager` 清晰，新增用例成本低。

---

## 轻微问题（MEDIUM 以下）

[LOW] `mockListScripts` 中 `filters.mineUserId` 的过滤逻辑使用 `||`（OR），语义上是「该状态 OR 是我创建的」，但本文件所有用例均未触达此分支，逻辑正确性未被本文件用例验证，属覆盖盲区。不影响串联生命周期，但建议 unit20 或专项用例补充。

[LOW] `vi.clearAllMocks()` 在 `beforeEach` 中调用，会清除 mock 调用次数记录，但 `resetStore()` 已独立重置状态，两者不冲突。`clearAllMocks` 在此场景略为冗余（因为用例不 assert spy 调用次数），无副作用。

---

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 0     |
| LOW      | 2     |

Verdict: PASS
