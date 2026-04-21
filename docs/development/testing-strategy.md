---
title: SalesLearn - 测试策略
category: development
tags: [测试, TDD, 单元测试, E2E]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-21
status: active
---

# SalesLearn - 测试策略

## 1. 测试目标

- **最低覆盖率**：80%
- **测试类型**：单元测试 + 集成测试 + E2E 测试
- **开发方法**：TDD（Test-Driven Development）

---

## 2. TDD 工作流

```
RED    → 写测试（测试应该失败）
GREEN  → 写最小实现（测试通过）
IMPROVE → 重构（保持测试通过）
```

每个功能模块严格遵循此流程。

---

## 3. 测试分层

### 3.1 单元测试（Vitest）

**测试对象**：
- 工具函数（日期格式化、分数计算等）
- 数据转换逻辑
- 业务规则（错题本间隔计算、评分加权等）
- React Hooks
- 组件渲染

**示例场景**：
- 艾宾浩斯间隔计算是否正确
- 评分加权计算是否正确
- 知识点分类筛选逻辑

### 3.2 集成测试（Vitest + Testing Library）

**测试对象**：
- API Route Handlers
- 数据库操作（ORM 查询）
- LLM 调用（Mock OpenRouter 响应）
- 组件交互流程

**示例场景**：
- 创建知识点 → 数据库写入 → 查询验证
- 提交答案 → 判定对错 → 更新错题本
- 上传文件 → AI 切分 → 返回结构化数据

### 3.3 E2E 测试（Playwright）

**测试对象**：
- 关键用户流程
- 跨页面交互
- 角色权限验证

**关键测试用例**：
- 员工学习流程：登录 → 浏览卡片 → 做题 → 查看结果
- 费曼讲解流程：选择知识点 → 录音 → 提交 → 查看评分
- 主管审核流程：登录 → 查看待审核 → 通过/打回
- 权限控制：员工无法访问主管页面

---

## 4. Mock 策略

| 外部依赖 | Mock 方式 |
|---|---|
| OpenRouter (LLM) | 固定响应 JSON（单测）/ Mock Server（集成）|
| 腾讯云 ASR | 固定转写文本 |
| Vercel Blob | 内存文件存储 |
| Neon Database | 测试数据库实例（集成测试使用真实DB）|

---

## 5. 测试命令

```bash
# 单元测试
pnpm test

# 单元测试（监听模式）
pnpm test:watch

# 覆盖率报告
pnpm test:coverage

# E2E 测试
pnpm test:e2e

# E2E 测试（UI 模式）
pnpm test:e2e:ui
```

---

## 6. CI 集成

- PR 提交时自动运行单元测试 + 集成测试
- 合并到 develop 时运行 E2E 测试
- 覆盖率低于 80% 阻止合并
