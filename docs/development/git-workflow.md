---
title: SalesLearn - Git 工作流
category: development
tags: [Git, 分支策略, Commit规范]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-21
status: active
---

# SalesLearn - Git 工作流

## 1. 分支策略

```
main (生产环境)
  ├── develop (开发环境)
  │   ├── feat/knowledge-upload
  │   ├── feat/quiz-system
  │   ├── fix/login-error
  │   └── ...
  └── release/v1.0.0 (发布分支)
```

| 分支类型 | 命名 | 说明 |
|---|---|---|
| 主分支 | `main` | 生产环境，保护分支 |
| 开发分支 | `develop` | 集成开发，自动部署 Preview |
| 功能分支 | `feat/<name>` | 新功能开发 |
| 修复分支 | `fix/<name>` | Bug 修复 |
| 重构分支 | `refactor/<name>` | 代码重构 |
| 发布分支 | `release/v<version>` | 版本发布准备 |

---

## 2. Commit 规范

### 格式
```
<type>: <description>

<optional body>
```

### Type 类型
| Type | 说明 |
|---|---|
| feat | 新功能 |
| fix | Bug 修复 |
| refactor | 重构 |
| docs | 文档 |
| test | 测试 |
| chore | 构建/工具 |
| perf | 性能优化 |
| ci | CI/CD |

### 示例
```
feat: add knowledge card swipe interaction
fix: correct error book review interval calculation
refactor: extract LLM service into shared module
```

---

## 3. PR 流程

1. 从 `develop` 创建功能分支
2. 开发完成后创建 PR → `develop`
3. PR 包含：Summary + Test Plan
4. 至少 1 人 Code Review（MVP 阶段自审可）
5. CI 通过后 Merge
6. 删除功能分支

---

## 4. 发布流程

1. 从 `develop` 创建 `release/v<version>` 分支
2. 在 release 分支上进行最终测试和修复
3. 合并到 `main` + 打 Tag
4. `main` 自动部署到生产环境
5. 合并回 `develop`

---

## 5. Vercel 部署集成

| 分支 | 部署环境 |
|---|---|
| `main` | Production |
| `develop` | Preview (开发环境) |
| `feat/*` | Preview (功能预览) |
