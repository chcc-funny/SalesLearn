### 判定: PASS

**审查范围**：`lib/services/scripts/tags.ts` + `tests/unit/scripts-tags-service.test.ts`

---

## 服务层（tags.ts）

### 安全 & 多租户隔离
- `listTags`、`updateTag`、`softDeleteTag`、`sortTags` 所有写操作均显式 `WHERE tenant_id = ?`，通过。
- `sortTags` 内循环 WHERE 同时包含 `tenantId + groupKey + id`，可防止跨 groupKey 和跨租户的拖拽污染，设计正确。
- 使用 Drizzle ORM 参数化查询，无字符串拼接 SQL，无注入风险。

### 事务边界
- `sortTags` 是循环串行单条 UPDATE，**未使用事务**。若循环中途失败（网络抖动），前几条已写入但后续未写，会导致 sortOrder 部分脏数据。
- 标签数量 < 50（注释说明），数据量小，业务影响可接受，但仍是潜在一致性隐患。

### 状态机
- tags 服务无状态机要求，不适用。

### 错误处理
- `createTag` 在 returning 空时正确抛出 Error，而非静默返回 undefined。
- `updateTag` / `softDeleteTag` 找不到记录返回 null（设计正确，上层决定 404 语义）。

---

## 测试层（scripts-tags-service.test.ts）

### Mock 设计
- 使用 `vi.hoisted` + 链式 mock，颗粒度合理，不过度 mock（仅 mock db，未 mock 业务逻辑本身）。
- `beforeEach` 调用 `wireChain()` 确保每个用例 mock 状态干净，隔离良好。

### 覆盖情况
- `listTags` / `createTag` / `updateTag` / `softDeleteTag` / `sortTags` 全部有用例，正负路径均覆盖。

---

## MEDIUM

**[M1] `sortTags` 未使用数据库事务**
`lib/services/scripts/tags.ts:147`：循环内逐条 UPDATE 没有包在 `db.transaction()` 中，中途失败会留下部分脏数据。对当前 < 50 条的标签场景风险低，但建议记录 TODO 或在注释中说明「接受此一致性权衡」。

**[M2] `sortTags` 测试未验证 `tenantId` 和 `groupKey` 同时传入 WHERE**
测试仅验证 `mockUpdate` 调用次数和 `sortOrder` 值，未断言 `mockSet` 或 `mockWhere` 接收了正确的 `tenantId + groupKey`，无法证明跨租户隔离在 sortTags 路径上生效。

---

## LOW

**[L1] `createTag` 测试未验证 `onConflictDoNothing` 是否不适用**
（tags 服务的 insert 无此调用，但若 DB 层 unique 约束触发，上层错误消息需 API 层转译为 409——这部分无单元覆盖）

---

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 2     | info   |
| LOW      | 1     | note   |

**Verdict: PASS** — 无 CRITICAL/HIGH 问题，MEDIUM 问题（事务缺失）建议在下一迭代补充或留注释说明设计取舍。
