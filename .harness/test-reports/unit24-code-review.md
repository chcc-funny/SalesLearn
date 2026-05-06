### 判定: PASS

**审查单元**: unit24 — 标签 CRUD (`/api/admin/script-tags` + `/api/admin/script-tags/[id]`)

**文件**:
- `app/api/admin/script-tags/route.ts`
- `app/api/admin/script-tags/[id]/route.ts`
- `lib/validations/script-tag.ts`
- `lib/services/scripts/tags.ts`
- `tests/integration/admin-script-tags.test.ts`

---

## 路由实现

**updateScriptTagSchema 是否阻止改 groupKey**: 是。`updateScriptTagSchema`（lib/validations/script-tag.ts:44-53）仅暴露 `name / sortOrder / isActive` 三字段，不含 `groupKey`。路由层额外显式构建 `input` 对象（[id]/route.ts:55-60），只从 `parsed.data` 取已知字段，即使 zod 未剥离多余字段也有双重保护。

**DELETE 是物理还是软删**: 软删。`softDeleteTag` 执行 `UPDATE scriptTags SET isActive=false`（tags.ts:119-130），保留历史 `script_tag_relations`，记录不删除。路由注释和 service 注释均明确说明。

**参数化查询**: 所有 SQL 操作通过 Drizzle ORM `eq()` / `and()` 构建，无字符串拼接，无注入风险。

**tenant 隔离**:
- `listTags`: WHERE 包含 `eq(scriptTags.tenantId, tenantId)`
- `createTag`: INSERT 直接注入 `tenantId`（来自 session）
- `updateTag` / `softDeleteTag`: WHERE 包含 `and(tenantId, id)` 复合条件，跨租户更新静默失败（返回 null → 路由层 404）

**GET 参数解析**: `onlyActive` 使用自定义 `queryBooleanSchema` 避免 `z.coerce.boolean()` 的 "false" → true 陷阱，逻辑正确。

**空 body PUT → 400**: `updateScriptTagSchema` 有 `.refine(data => Object.keys(data).length > 0)` 保护，空对象提交会被拒绝。

---

## 集成测试

**覆盖率**: 全面。每个操作均覆盖成功路径、403 角色、400 参数校验、404 不存在/跨租户、500 DB 异常、跨租户安全断言。

**groupKey 防护测试**: `"body 含 groupKey 也被 zod 忽略"` 用例（第 327-334 行）直接断言 `input.groupKey` 为 `undefined`，验证了 zod schema + 路由层双重剥离效果。

**401 黑盒**: 单个测试覆盖 GET/POST/PUT/DELETE 四个方法，使用 `vi.resetModules` + `vi.doMock` 重新加载模块模拟未登录场景，模式正确。

**mock 颗粒度**: service 层（listTags/createTag/updateTag/softDeleteTag）整体 mock，与 DB 实现解耦，粒度合理。

---

## 无 CRITICAL / HIGH 问题

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 0     |
| LOW      | 0     |

Verdict: PASS
