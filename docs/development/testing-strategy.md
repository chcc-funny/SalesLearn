---
title: SalesLearn - 测试策略
category: development
tags: [测试, TDD, 单元测试, E2E]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-22
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
- 费曼实战流程：Stage A ≥80 → 解锁 → 选择人设 → 多轮对话 → 查看评估报告
- 主管审核流程：登录 → 查看待审核 → 通过/打回
- 权限控制：员工无法访问主管页面
- Stage B 解锁控制：未达 80 分不可进入 Stage B 页面

---

## 4. Mock 策略

| 外部依赖 | Mock 方式 |
|---|---|
| OpenRouter (LLM) | 固定响应 JSON（单测）/ Mock Server（集成）|
| OpenRouter Streaming | Mock SSE 事件流（含 META 标记解析测试）|
| 腾讯云 ASR | 固定转写文本 |
| Vercel Blob | 内存文件存储 |
| Neon Database | 测试数据库实例（集成测试使用真实DB）|

---

## 5. 测试命令

```bash
# 单元测试 + 集成测试
npm test

# 单元测试（监听模式）
npm run test:watch

# 覆盖率报告
npm run test:coverage
```

---

## 6. CI 集成

- PR 提交时自动运行单元测试 + 集成测试
- 合并到 develop 时运行 E2E 测试
- 覆盖率低于 80% 阻止合并

---

## 7. 测试执行结果（2026-04-23）

### 7.1 总体概况

| 类型 | 文件数 | 用例数 | 通过 | 失败 |
|------|--------|--------|------|------|
| 单元测试 | 5 | 45 | 45 | 0 |
| 集成测试 | 2 | 11 | 11 | 0 |
| E2E 验证 | - | 6 | 5 | 1 (DB连接) |
| **合计** | **7** | **62** | **61** | **1** |

### 7.2 已测试模块覆盖率

| 模块 | 行覆盖率 | 分支覆盖率 |
|------|---------|-----------|
| lib/api-response.ts | 100% | 66.7% |
| lib/validations/feynman-checks.ts | 97.8% | 85.3% |
| lib/rate-limit.ts | 83.3% | 82.4% |

### 7.3 发现的问题

1. ~~**[MEDIUM]** 登录失败时 API 返回原始 SQL 语句，存在信息泄露风险~~ ✅ 已修复
2. **[LOW]** lib/ 总覆盖率 25.2%，需补充 asr/auth/llm/storage 模块测试
3. ~~**[LOW]** rate-limit.ts 的定时清理逻辑未被覆盖~~ ✅ 已修复

> 详细测试进度和更新日志见 `@docs/development/testing-progress.md`

---

## 8. 测试账号

| 角色 | 姓名 | 邮箱 | 密码 |
|------|------|------|------|
| 主管 (manager) | 张主管 | `manager@saleslearn.com` | `admin123` |
| 员工 (employee) | 李销售 | `employee1@saleslearn.com` | `test123` |
| 员工 (employee) | 王销售 | `employee2@saleslearn.com` | `test123` |

> 测试数据由 `npm run db:seed` 生成，租户 ID: `00000000-0000-0000-0000-000000000001`
