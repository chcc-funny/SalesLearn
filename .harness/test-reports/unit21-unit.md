### 判定: PASS

## 测试目标
- unit21：tests/integration/admin-scripts-update-delete.test.ts（管理端 PUT/DELETE /api/admin/scripts/[id] 集成测试）

## 执行命令
```
pnpm vitest run tests/integration/admin-scripts-update-delete.test.ts
```

## 结果
- Test Files: 1 passed
- Tests: 19 passed / 19 total
- Duration: 440ms
- 失败: 0
- 跳过: 0

## 用例覆盖
- PUT 更新：title/customerQuestion/answer 字段、status 流转（draft↔pending_review↔published↔archived）
- PUT 标签更新：sceneTagIds / productTagIds 数组替换
- PUT 校验：非法 UUID、非法 status enum、字段越界 → 400
- PUT 鉴权：员工 → 403、未登录 → 401
- PUT 资源不存在 / 跨租户 / 软删除 → 404 NOT_FOUND
- DELETE 软删除：deletedAt 设值、写库成功
- DELETE 资源不存在 → 404
- DELETE 鉴权：员工 → 403、未登录 → 401
- DELETE 异常：DB 抛错 → 500 DATABASE_ERROR

## 联合验证
完整命令 `pnpm vitest run tests/integration/scripts-*.test.ts tests/integration/admin-scripts*.test.ts` 同时执行 6 个文件 81 用例全绿，无回归。
