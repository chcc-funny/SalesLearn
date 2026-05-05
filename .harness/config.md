# Harness Config — SalesLearn 精选话术（Scripts）模块

## 产物类型

`PRODUCT_TYPE`: `module`

精选话术模块包含数据层、服务层、API、页面多种产物，整体作为一个功能模块批量交付。

## 批次设置

`BATCH_SIZE`: `3`

每批 3 个 unit，平衡上下文和吞吐。

## 修正轮次上限

`FIX_MAX_ROUNDS`: `3`

## 启用的测试维度

```yaml
DIMENSIONS:
  - typecheck
  - lint
  - unit-test
  - code-review
  # - e2e   # 末尾整体跑一次，不在每批跑
```

## 单元测试覆盖率阈值

`COVERAGE_THRESHOLD`: `80`

## 工作目录约定

```
.harness/
├── config.md
├── plan.md
├── main-log.md
├── lessons-learned.md
└── test-reports/
```
