---
title: SalesLearn - 系统架构设计
category: architecture
tags: [系统架构, 技术栈, Next.js, Vercel]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-21
status: active
---

# SalesLearn - 系统架构设计

## 1. 技术栈

| 层级 | 技术选型 | 说明 |
|---|---|---|
| 前端框架 | Next.js 14 (App Router) | SSR/CSR 混合渲染 |
| UI 框架 | TailwindCSS + shadcn/ui | 组件化开发 |
| 部署平台 | Vercel | 自动化 CI/CD |
| 数据库 | Neon (Postgres Serverless) | Serverless Postgres |
| ORM | Drizzle | 类型安全的轻量级 ORM |
| 认证 | NextAuth.js | 员工账号 + 主管账号双角色 |
| 文件存储 | Vercel Blob 或 S3 | 知识库图片、录音文件 |
| LLM - 知识切分/出题 | Claude Sonnet / Kimi K2 | 通过 OpenRouter 路由 |
| LLM - 费曼评分 | Claude Sonnet | 评分精准度优先 |
| 语音转文字 | 腾讯云 ASR | 中文语音识别 |

---

## 2. 系统架构图

```
┌─────────────────────────────────────────────────────────┐
│                     客户端 (Browser)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ 员工端    │  │ 主管端    │  │ 移动端    │              │
│  │ (PWA)    │  │ (Desktop) │  │ (响应式)  │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
└───────┼──────────────┼──────────────┼───────────────────┘
        │              │              │
        ▼              ▼              ▼
┌─────────────────────────────────────────────────────────┐
│                  Next.js 14 (Vercel)                     │
│                                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │             App Router                       │        │
│  │  /learn/*  /test/*  /feynman/*  /admin/*    │        │
│  └──────────────────┬──────────────────────────┘        │
│                     │                                    │
│  ┌──────────────────┼──────────────────────────┐        │
│  │           API Routes (Route Handlers)        │        │
│  │  /api/knowledge  /api/quiz  /api/feynman    │        │
│  │  /api/auth       /api/review /api/report    │        │
│  └──────┬───────────┬───────────┬──────────────┘        │
└─────────┼───────────┼───────────┼───────────────────────┘
          │           │           │
          ▼           ▼           ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│   Neon   │  │ OpenRouter│  │ 腾讯云    │
│ Postgres │  │  (LLM)   │  │  ASR     │
└──────────┘  └──────────┘  └──────────┘
                              ┌──────────┐
                              │ Vercel   │
                              │ Blob/S3  │
                              └──────────┘
```

---

## 3. 模块划分

### 3.1 前端模块

```
app/
├── (auth)/           # 认证相关页面
│   └── login/
├── (employee)/       # 员工端
│   ├── learn/        # 图文学习
│   ├── test/         # 卡片测试
│   ├── feynman/      # 费曼讲解
│   ├── review/       # 错题本
│   └── dashboard/    # 个人看板
├── (admin)/          # 主管端
│   ├── knowledge/    # 知识库管理
│   ├── review/       # 审核管理
│   └── team/         # 团队看板
└── api/              # API 路由
    ├── auth/
    ├── knowledge/
    ├── quiz/
    ├── feynman/
    ├── review/
    └── report/
```

### 3.2 后端模块

| 模块 | 职责 | 关键接口 |
|---|---|---|
| Auth | 认证授权 | 登录、角色鉴权 |
| Knowledge | 知识库管理 | CRUD、AI切分、审核 |
| Quiz | 测试管理 | AI出题、审核、作答记录 |
| Feynman | 费曼讲解 | 录音上传、转写、AI评分 |
| Review | 错题本 | 间隔复习调度 |
| Report | 评估报告 | 数据聚合、看板数据 |

---

## 4. 第三方服务集成

### 4.1 OpenRouter（LLM 路由）
- **用途**：统一接入 Claude Sonnet 和 Kimi K2
- **路由策略**：
  - 知识切分/出题 → Kimi K2（成本优化）
  - 费曼评分/客户追问 → Claude Sonnet（质量优先）
  - 短文本任务 → Claude Haiku（成本优化）

### 4.2 腾讯云 ASR
- **用途**：费曼讲解的语音转文字
- **接入方式**：实时语音识别 API
- **语言**：中文普通话

### 4.3 NextAuth.js
- **认证方式**：Credentials Provider（账号密码）
- **角色**：employee / manager
- **Session 策略**：JWT

---

## 5. 数据流

### 5.1 知识库录入流程
```
上传文件 → API → 文件存储(Blob) → 
LLM切分(OpenRouter/Kimi) → 结构化数据 → 
Neon DB(status:reviewing) → 主管审核 → 
Neon DB(status:published)
```

### 5.2 费曼讲解流程
```
前端录音(MediaRecorder) → 音频上传(Blob) → 
腾讯云ASR(语音转文字) → 转写文本 → 
用户确认/修正 → LLM评分(OpenRouter/Claude) → 
评分结果 → Neon DB
```

---

## 6. SaaS 化预留

### 6.1 多租户隔离
- 所有数据表包含 `tenant_id` 字段
- API 层自动注入租户上下文
- 数据库查询自动添加租户过滤

### 6.2 可扩展性
- 知识库与评估引擎解耦
- LLM Provider 可替换（通过 OpenRouter 抽象）
- ASR Provider 可替换（接口标准化）

---

## 7. 安全设计

- 认证：NextAuth.js JWT Token
- 授权：基于角色的访问控制（RBAC）
- API 安全：Rate Limiting + CORS
- 数据安全：Neon 自动加密 + SSL
- 文件安全：Vercel Blob 签名 URL
- 敏感信息：环境变量管理，不硬编码
