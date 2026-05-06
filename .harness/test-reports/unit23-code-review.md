### 判定: PASS

**审查单元**: unit23 — `POST /api/admin/scripts/from-knowledge`

**文件**:
- `app/api/admin/scripts/from-knowledge/route.ts`
- `tests/integration/admin-scripts-from-knowledge.test.ts`

---

## 路由实现

**跨租户防护 / ID 枚举**: 正确。DB 查询使用 `and(eq(knowledgeBase.id, knowledgeId), eq(knowledgeBase.tenantId, user.tenantId))` 复合条件，跨租户 ID 与不存在 ID 均返回 404，不区分两种情况，防止 ID 枚举。

**知识库读取参数化**: 使用 Drizzle ORM `eq()` 条件构建，无字符串拼接，无 SQL 注入风险。

**标签 UUID 透传防御**: `fromKnowledgeBodySchema` 对 `sceneTagIds` / `productTagIds` 内每个元素校验 `z.string().uuid()`，并限制数组长度上限 20，非法 UUID 在 zod 层拒绝，不会透传到 `createScript`。

**source / status 强制**: `input` 对象硬编码 `source: "from_knowledge"` / `status: "draft"`，body 中同名字段被 zod 忽略（schema 不暴露这两个字段），测试也专门验证了此行为。

**tenantId 隔离**: `tenantId` 和 `createdBy` 均来自 `user`（session），body 中的同名字段被 schema 丢弃。

**title 截断**: `slice(0, 200)` 防止超出 VARCHAR(200) 限制。

---

## 集成测试

**覆盖**: 成功路径、knowledge 不存在→404、跨租户→404、缺 knowledgeId→400、非 UUID→400、标签含非法 UUID→400、员工→403、非法 JSON→400、DB select 异常→500、createScript 异常→500、跨租户安全断言、source/status 强制断言、401 黑盒契约。

**注意**: 测试注释（第 7 行）写的是"跨租户 → 403 FORBIDDEN"，但实现实际返回 404。测试用例本身验证的是 404（code=1002），与实现一致，注释有误但不影响正确性。这是 LOW 级别文档问题。

**mock 颗粒度**: `mockDbSelect → mockDbFrom → mockDbWhere` 链式 mock 正确模拟了 Drizzle 查询链，`mockDbWhere.mockResolvedValue([])` 可模拟跨租户/不存在两种场景。

---

## 发现

[LOW] 测试文件顶部 JSDoc 注释（第 7-8 行）描述"跨租户 knowledge → 403 FORBIDDEN"，实际实现与对应测试用例均为 404 NOT_FOUND，注释与实现不一致。
文件: `tests/integration/admin-scripts-from-knowledge.test.ts:7-8`

---

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 0     |
| LOW      | 1     |

Verdict: PASS — 仅注释描述与实现语义不符，无功能缺陷。
