### 判定: PASS

## 测试目标
- unit19：tests/integration/scripts-copy.test.ts（POST /api/scripts/[id]/copy 集成测试）

## 执行命令
```
pnpm vitest run tests/integration/scripts-copy.test.ts
```

## 结果
- Test Files: 1 passed
- Tests: 11 passed / 11 total
- Duration: 246ms
- 失败: 0
- 跳过: 0

## 用例覆盖
- 复制成功（已发布话术 → usageCount+1）
- 不存在的 script → 404 NOT_FOUND
- 跨租户隔离 → 404
- 软删除（deletedAt 非空）→ 404
- 非 published 状态（draft/pending_review/archived）→ 409 CONFLICT
- 非法 UUID → 400 VALIDATION_ERROR
- 数据库异常 → 500 DATABASE_ERROR
- 鉴权未登录黑盒 → 401 UNAUTHORIZED（code=2001）
- 计数失败容错路径

## 联合验证
完整命令 `pnpm vitest run tests/integration/scripts-*.test.ts tests/integration/admin-scripts*.test.ts` 同时执行 6 个文件 81 用例全绿，无回归。

## 顺手项
- scripts-list.test.ts 与 scripts-tags.test.ts 中的 401 黑盒用例此前已存在（参见 scripts-list.test.ts:270-294、scripts-tags.test.ts:196-222），无需新增。
