---
title: SalesLearn - 部署指南
category: operations
tags: [部署, Vercel, CI/CD]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-22
status: active
---

# SalesLearn - 部署指南

## 1. 部署架构

| 组件 | 平台 | 说明 |
|---|---|---|
| 前端 + API | Vercel | Next.js 全栈部署 |
| 数据库 | Neon | Postgres Serverless |
| 文件存储 | Vercel Blob / S3 | 图片、录音文件 |
| 域名 | {待定} | 自定义域名 |

---

## 2. 环境配置

### 2.1 环境变量

```env
# 数据库
DATABASE_URL=postgresql://...@neon.tech/saleslearn

# NextAuth.js
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=https://saleslearn.vercel.app

# OpenRouter (LLM)
OPENROUTER_API_KEY=<api-key>

# 腾讯云 ASR
TENCENT_SECRET_ID=<secret-id>
TENCENT_SECRET_KEY=<secret-key>

# 文件存储
BLOB_READ_WRITE_TOKEN=<token>
```

### 2.2 环境说明

| 环境 | 用途 | 部署触发 |
|---|---|---|
| Production | 生产环境 | push to `main` |
| Preview | 预览环境 | push to `develop` / PR |
| Development | 本地开发 | `npm run dev` |

---

## 3. 部署流程

### 3.1 首次部署

1. 在 Vercel 创建项目，关联 GitHub 仓库
2. 配置环境变量（参考 2.1）
3. 在 Neon 创建数据库，获取连接字符串
4. 运行数据库迁移：`npx drizzle-kit generate && npx drizzle-kit push`
5. 推送代码到 `main` 分支
6. Vercel 自动构建部署

### 3.2 日常部署

```
功能分支 → PR → Review → Merge to develop → Preview 验证 → 
Merge to main → Production 自动部署
```

### 3.3 回滚

- Vercel Dashboard → Deployments → 选择历史部署 → Promote to Production
- 或使用 `vercel rollback` CLI 命令

---

## 4. 本地开发

```bash
# 安装依赖
npm install

# 环境变量
cp .env.example .env.local

# 数据库迁移（生成迁移文件并推送到数据库）
npx drizzle-kit generate && npx drizzle-kit push

# 启动开发服务器
npm run dev
```

---

## 5. 健康检查

- **应用**：`/api/health` 返回 200
- **数据库**：连接池状态监控
- **LLM 服务**：OpenRouter 状态页面
- **ASR 服务**：腾讯云控制台监控
