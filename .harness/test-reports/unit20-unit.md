### 判定: PASS

## 测试目标
- unit20：tests/integration/admin-scripts-list-create.test.ts（管理端 GET /api/admin/scripts + POST 集成测试）

## 执行命令
```
pnpm vitest run tests/integration/admin-scripts-list-create.test.ts
```

## 结果
- Test Files: 1 passed
- Tests: 16 passed / 16 total
- Duration: 440ms
- 失败: 0
- 跳过: 0

## 用例覆盖
- GET 列表：主管角色访问、status 过滤透传、source 过滤、q 关键字、scene/product 标签数组过滤、分页边界
- GET 校验：非法 status / 非 UUID 标签 / pageSize 越界 → 400 VALIDATION_ERROR
- GET 异常：listScripts 抛错 → 500 DATABASE_ERROR
- POST 新建：必填字段校验、status 默认值、createdBy 自动注入主管 id、写库成功响应 200/201
- POST 校验失败 → 400
- 鉴权：员工角色 → 403 FORBIDDEN；未登录 → 401

## 联合验证
完整命令 `pnpm vitest run tests/integration/scripts-*.test.ts tests/integration/admin-scripts*.test.ts` 同时执行 6 个文件 81 用例全绿，无回归。
