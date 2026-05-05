### 判定: PASS

**文件**: `app/api/scripts/[id]/route.ts`

---

## 审查结论

无 CRITICAL / HIGH 问题。逻辑清晰，安全边界明确。

---

## 逐项分析

### 1. 员工/管理员鉴权分支

鉴权分支正确。`user.role === "employee"` 时，`status !== "published" && createdBy !== user.id` 两个条件同时满足才拦截，语义：published 或自己创建的任意状态均可读。主管路径不进入该 if，直接返回 200。与 PRD 描述一致。

**注意点**（LOW）：员工读自己创建的 `archived` 话术会返回 200（`scripts-detail.test.ts:156` 行注释也承认了这一边界），业务上存疑——已下架的话术员工是否应该继续可读？当前测试用 `expect(res.status).toBe(200)` 断言并注释说明，属于有意识的决策，不算 bug，但建议在 PRD 中显式记录。

### 2. 404/403 区分 & 防 ID 枚举

越权访问统一返回 `ErrorCode.NOT_FOUND`（msg "话术不存在"），与跨租户/软删语义相同，正确隐藏了存在性，防止 ID 枚举。没有任何 403 泄露。

### 3. `params?.id` 空校验

`params?.id` 缺少时返回 400 `VALIDATION_ERROR`，合理。但 Next.js App Router 中 `params` 在动态路由下一定存在 `id`，此路径在正常部署中不可达；测试文件中通过传入 `Promise.resolve({})` 覆盖了这条路径，可接受。

### 4. 错误处理

catch 块统一返回 500 `DATABASE_ERROR`，不泄露内部堆栈，正确。

---

## 问题清单

| 等级 | 位置 | 说明 |
|------|------|------|
| LOW | route.ts:44 | 员工读自己 archived 话术返回 200，业务语义未在 PRD 显式确认 |
