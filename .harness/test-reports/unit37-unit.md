### 判定: PASS

## unit37 - tests/unit/scripts-fulltext-search.test.ts

### 测试结果
- 测试文件: 1 passed
- 测试用例: 通过（全部 52 个用例中 unit37 部分全部通过）
- 全量回归: 71 files / 947 passed (1 skipped) - 0 失败

### 覆盖率（lib/services/scripts/fulltext-search.ts）
| 指标 | 数值 | 阈值 | 状态 |
|---|---|---|---|
| Statements | 100% | ≥60% | PASS |
| Branches | 90% | - | - |
| Functions | 100% | - | - |
| Lines | 100% | ≥60% | PASS |

未覆盖行: 行 64（极端边界分支）

### 关键校验点
- 基础: 空 query 短路、仅空白 query 短路、非空 query 调 DB、默认 limit=20、自定义 limit 透传、limit=0 退化为 ≥1
- 多租户与默认条件: where 包含 tenant_id、跨租户独立查询
- 标签过滤: 不传 tag 不触发 innerJoin、sceneTagId/productTagId 触发 innerJoin、双 tag 触发两次 innerJoin
- 排序: 按 score 倒序（orderBy 调用）
- 安全: 特殊字符（SQL 注入语句、% 通配符）不抛错
- 错误处理: DB 抛错向上传播

### 结论
unit37 PASS。覆盖率 100% (statements/lines)，远超 60% 阈值。
