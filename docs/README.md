---
title: SalesLearn - 文档中心
category: index
tags: [文档索引]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-21
status: active
---

# SalesLearn - 文档中心

> 本文档是 SalesLearn（销售培训学习系统）的文档索引，帮助团队成员快速找到所需信息。

## 文档分类

### 产品文档
- [`product/PRD.md`](product/PRD.md) - 产品需求文档
- [`product/user-stories.md`](product/user-stories.md) - 用户故事
- [`product/business-flow.md`](product/business-flow.md) - 业务流程

### 设计文档
- [`design/design-system.md`](design/design-system.md) - 设计系统规范
- [`design/page-specifications.md`](design/page-specifications.md) - 页面详细说明
- [`design/components.md`](design/components.md) - 组件库文档

### 架构文档
- [`architecture/system-architecture.md`](architecture/system-architecture.md) - 系统架构设计
- [`architecture/database-design.md`](architecture/database-design.md) - 数据库设计
- [`architecture/api-routes.md`](architecture/api-routes.md) - API 路由设计

### API 文档
- [`api/README.md`](api/README.md) - API 接口文档

### 开发文档
- [`development/coding-standards.md`](development/coding-standards.md) - 代码规范
- [`development/git-workflow.md`](development/git-workflow.md) - Git 工作流
- [`development/testing-strategy.md`](development/testing-strategy.md) - 测试策略

### 运维文档
- [`operations/deployment.md`](operations/deployment.md) - 部署指南
- [`operations/operations-manual.md`](operations/operations-manual.md) - 运维手册

### 项目管理文档
- [`project/project-plan.md`](project/project-plan.md) - 项目计划

---

## 快速开始

### 新成员上手指南
1. 阅读 [`product/PRD.md`](product/PRD.md) 了解项目目标和功能
2. 阅读 [`architecture/system-architecture.md`](architecture/system-architecture.md) 了解技术架构
3. 阅读 [`development/coding-standards.md`](development/coding-standards.md) 了解代码规范
4. 阅读 [`development/git-workflow.md`](development/git-workflow.md) 了解协作流程

### 文档更新规范
1. **元数据维护**：每次修改文档时，更新 `last_updated` 字段和 `version` 版本号
2. **状态标记**：使用 `status` 字段标记文档状态（draft/active/deprecated）
3. **注册机制**：重要文档必须在项目 `CLAUDE.md` 中注册

---

## 文档维护

### 文档状态说明
- `draft` - 草稿，内容未完成
- `active` - 活跃，内容已完成且在使用中
- `deprecated` - 已废弃，仅保留归档

### 版本号规范
- **主版本号**：重大变更（如架构调整）
- **次版本号**：功能新增或重要修改
- **修订号**：错误修正或小幅更新
