### 判定: PASS

## 单元: unit25 - admin-scripts-crud 集成测试

### 测试目标
- 文件: `tests/integration/admin-scripts-crud.test.ts`
- 主题: 管理端 Scripts 模块 CRUD 全生命周期 (7 用例)

### 执行结果
- Test Files: 1 passed
- Tests: 7/7 passed
- 时长: ~107ms（局部）
- 全量回归: 61 files / 794 passed / 1 skipped / 0 failed

### 命令
```
pnpm vitest run tests/integration/admin-scripts-crud.test.ts \
  tests/integration/admin-script-tags.test.ts \
  tests/integration/admin-scripts-from-knowledge.test.ts \
  tests/unit/script-card.test.tsx --coverage
```

### 覆盖范围
- 创建话术（Draft 状态）
- 列表/分页/筛选
- 详情读取
- 更新（编辑标题/正文/标签）
- 状态机迁移（Draft → Published / Archived）
- 删除/软删除
- 权限校验（admin only）

### 结论
所有用例通过，集成测试稳定，不影响全量回归。
