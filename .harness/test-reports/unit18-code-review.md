### 判定: PASS

**文件**: `tests/integration/scripts-list.test.ts` + `tests/integration/scripts-tags.test.ts`

---

## 审查结论

无 CRITICAL / HIGH 问题。两个测试文件覆盖面良好，mock 颗粒度合理，负路径基本完备。

---

## 逐项分析（scripts-list.test.ts）

### 正路径覆盖

覆盖了员工/主管各自的默认行为、分页、过滤（q / status / source / sceneTagIds / productTagIds）、空结果，正路径完备。

### 负路径覆盖

非法 status、非法 sceneTagIds（非 UUID）、pageSize 超限、DB 异常均有测试，覆盖良好。

### 鉴权失败路径

**MEDIUM 问题**：`withAuth` 被 mock 为直接透传 `currentUser`，测试中没有任何用例覆盖「未登录 → withAuth 返回 401」这条路径。注释里提到"鉴权失败 → withAuth 提供 401"，但实际上该分支在本测试文件中完全未验证。这是可接受的权衡（withAuth 本身可在 guard 单元测试中覆盖），但集成测试层面缺少一个"未提供 token → 401"的黑盒用例。

### status=draft 边界

员工传 `status=draft` 时，验证了 service 收到 `status=draft + mineUserId`，语义是「OR 自己创建的」，边界测试合理。主管传 `status=draft` 验证了不附 `mineUserId`，两者都覆盖。

### Mock 颗粒度

mock 在 service 层（`listScripts`），路由层的 zod 校验、角色分支仍真实执行，颗粒度合适——既避免了 DB 依赖，又不会因为过深 mock 而遗漏路由逻辑错误。

---

## 逐项分析（scripts-tags.test.ts）

### 正路径覆盖

员工/主管均可访问、默认 `onlyActive=true`、按 group 分组、`groupKey` 过滤、`onlyActive=false`、空结果、脏数据防御性过滤，覆盖全面，包含一个有价值的"未知 groupKey 被忽略"边界测试。

### 负路径覆盖

非法 `groupKey`、非枚举 `onlyActive`（"yes" → 400）、DB 异常 → 500，负路径完备。

### 鉴权失败路径

同 scripts-list，未覆盖"未登录 → 401"黑盒路径。

### Mock 颗粒度

mock 在 `listTags` service 层，路由层分组逻辑真实执行，合理。

---

## 问题清单

| 等级 | 文件 | 说明 |
|------|------|------|
| MEDIUM | scripts-list.test.ts | 缺少「未登录/无效 token → 401」集成用例（依赖注释承诺的 withAuth 行为，未实际测试） |
| MEDIUM | scripts-tags.test.ts | 同上，鉴权失败路径未覆盖 |
| LOW | scripts-list.test.ts:148 | `json.meta.limit` 断言字段名为 `limit`，若响应结构改为 `pageSize` 会静默失败；建议与实际响应 schema 对齐确认字段名 |
