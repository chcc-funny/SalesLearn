# SalesLearn - 销售培训学习系统

## 项目概述

基于费曼学习法的 AI 销售培训系统，作为 SalesCoach Pro 的学习底座模块。
目标用户：汽车美容门店销售团队（MVP）→ SaaS 化面向同行。

## 技术栈

- **前端**：Next.js 14 (App Router) + TailwindCSS + shadcn/ui
- **部署**：Vercel
- **数据库**：Neon (Postgres Serverless) + Drizzle
- **认证**：NextAuth.js（员工/主管双角色）
- **LLM**：Claude Sonnet + Kimi K2（通过 OpenRouter 路由）
- **语音转文字**：腾讯云 ASR
- **文件存储**：Vercel Blob / S3

## 项目文档

### 文档总索引
- `@docs/README.md` - 文档中心（所有文档的导航和快速开始指南）

### 产品文档
- `@docs/product/PRD.md` - 产品需求文档（功能边界、业务规则的最终参考）
- `@docs/product/user-stories.md` - 用户故事（验收标准）
- `@docs/product/business-flow.md` - 业务流程（状态机和流程逻辑）

### 设计文档
- `@docs/design/design-system.md` - 设计系统规范（色彩、字体、阴影、圆角、间距、动画）
- `@docs/design/page-specifications.md` - 页面详细说明（布局、交互流程、状态变化）
- `@docs/design/components.md` - 组件库文档（组件使用指南）

### 技术文档
- `@docs/architecture/system-architecture.md` - 系统架构设计（技术栈、模块划分、第三方服务集成）
- `@docs/architecture/database-design.md` - 数据库设计（ER 图、表结构、索引、权限）
- `@docs/architecture/api-routes.md` - API 路由设计（路由列表、输入输出、权限验证）
- `@docs/api/README.md` - API 接口文档（所有接口定义、请求响应格式、调用示例）

### 开发文档
- `@docs/development/testing-strategy.md` - 测试策略（TDD、分层测试、Mock策略）
- `@docs/development/testing-progress.md` - 测试执行进度（用例通过率、覆盖率、问题跟踪）

## 核心模块

1. **知识库管理**：资料上传 → AI 切分 → 人工审核 → 发布
2. **图文学习**：卡片浏览 → 学习记录 → 引导测试
3. **卡片测试**：AI 出题 → 作答 → 错题本 → 间隔复习
4. **费曼讲解**：语音讲解 → 转文字 → AI 评分 → 客户追问实战
5. **评估看板**：学习完成度 + 测试分 + 讲解力 + 业绩转化

## 已决策事项

| 事项 | 决策 |
|---|---|
| 语音转文字供应商 | 腾讯云 ASR |
| LLM 路由 | OpenRouter（出题用 Kimi，评分用 Claude）|
| 与 SalesCoach Pro 关系 | 学习底座模块 |

## Ralph 文件规范

所有 Ralph 内部文件必须在 `.ralph/` 目录中，绝不允许在项目根目录创建。
`.gitignore` 必须包含 `/fix_plan.md`。
