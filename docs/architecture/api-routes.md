---
title: SalesLearn - API 路由设计
category: architecture
tags: [API路由, Next.js, Route Handlers]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-21
status: active
---

# SalesLearn - API 路由设计

> 注：本项目使用 Next.js Route Handlers（非传统云函数），部署在 Vercel Serverless Functions 上。

---

## 1. API 路由总览

| 路由 | 方法 | 说明 | 鉴权 |
|---|---|---|---|
| `/api/auth/[...nextauth]` | * | NextAuth.js 认证 | 公开 |
| `/api/knowledge` | GET | 获取知识点列表 | 员工/主管 |
| `/api/knowledge` | POST | 创建知识点 | 主管 |
| `/api/knowledge/[id]` | GET/PUT/DELETE | 知识点 CRUD | 主管 |
| `/api/knowledge/upload` | POST | 上传资料 + AI 切分 | 主管 |
| `/api/knowledge/[id]/review` | POST | 审核知识点 | 主管 |
| `/api/knowledge/tasks/[taskId]` | GET | 查询切分任务进度 | 主管 |
| `/api/quiz/generate` | POST | AI 生成测试题 | 主管 |
| `/api/quiz/[knowledgeId]` | GET | 获取知识点的题目 | 员工 |
| `/api/quiz/answer` | POST | 提交答案 | 员工 |
| `/api/quiz/[id]/review` | POST | 审核题目 | 主管 |
| `/api/feynman/upload-audio` | POST | 上传录音文件 | 员工 |
| `/api/feynman/transcribe` | POST | 语音转文字 | 员工 |
| `/api/feynman/evaluate` | POST | AI 评分（阶段A）| 员工 |
| `/api/feynman/chat` | POST | AI 客户对话（阶段B）| 员工 |
| `/api/review/list` | GET | 获取错题本 | 员工 |
| `/api/review/update` | POST | 更新复习结果 | 员工 |
| `/api/report/personal` | GET | 个人评估数据 | 员工 |
| `/api/report/team` | GET | 团队评估数据 | 主管 |

---

## 2. 核心 API 详细设计

### 2.1 知识库上传与切分

**POST `/api/knowledge/upload`**

```typescript
// 请求
{
  file: File,         // 上传的文件
  category?: string   // 预设分类（可选）
}

// 响应
{
  success: true,
  data: {
    taskId: string,           // 异步任务 ID
    originalFileName: string,
    status: 'processing'
  }
}

// 处理流程:
// 1. 上传文件到 Vercel Blob
// 2. 返回 taskId（同步，<2s）
// 3. 后台异步处理（Vercel Fluid Compute / 长时函数）：
//    a. 提取文本内容
//    b. 调用 LLM (Kimi K2 via OpenRouter) 切分知识点
//    c. 结构化数据写入 DB (status: reviewing)
// 4. 前端轮询 GET /api/knowledge/tasks/[taskId] 获取进度
//
// 超时与重试策略：
// - 单次 LLM 调用超时：30s
// - 大文件自动分段切分，每段独立调用 LLM
// - 失败自动重试 2 次（指数退避）
// - 最终失败状态：task.status = 'failed'，附带错误信息
```

### 2.2 AI 出题

**POST `/api/quiz/generate`**

```typescript
// 请求
{
  knowledgeId: string,
  count: number,          // 生成题数
  types?: string[]        // 指定题型
}

// 响应
{
  success: true,
  data: {
    questions: Array<{
      type: string,
      questionText: string,
      options: string[],
      correctAnswer: string,
      explanations: Record<string, string>
    }>
  }
}

// LLM: Kimi K2 via OpenRouter（成本优化）
```

### 2.3 费曼评分

**POST `/api/feynman/evaluate`**

```typescript
// 请求
{
  knowledgeId: string,
  transcript: string,     // 转写文本（可能经用户修正）
  audioUrl?: string       // 录音 URL
}

// 响应
{
  success: true,
  data: {
    scores: {
      completeness: number,
      accuracy: number,
      clarity: number,
      analogy: number
    },
    totalScore: number,
    coveredPoints: string[],
    missedPoints: string[],
    errors: string[],
    suggestions: string,
    canUnlockStageB: boolean
  }
}

// LLM: Claude Sonnet via OpenRouter（质量优先）
```

### 2.4 AI 客户对话

**POST `/api/feynman/chat`**

```typescript
// 请求
{
  knowledgeId: string,
  persona: 'beginner' | 'bargainer' | 'expert',
  chatHistory: Array<{
    role: 'ai' | 'user',
    content: string
  }>,
  userMessage: string
}

// 响应（Streaming）
{
  success: true,
  data: {
    aiResponse: string,
    isConvinced: boolean,     // AI 是否被说服
    roundNumber: number,
    isComplete: boolean       // 对话是否结束
  }
}

// LLM: Claude Sonnet via OpenRouter
// 支持 Streaming 响应
```

---

## 3. 权限验证

### 3.1 角色权限矩阵

| API | employee | manager |
|---|---|---|
| 知识点读取 | ✅（仅 published）| ✅（全部状态）|
| 知识点写入 | ❌ | ✅ |
| 题目读取 | ✅（仅 published）| ✅ |
| 题目审核 | ❌ | ✅ |
| 答题/讲解 | ✅ | ✅ |
| 个人报告 | ✅（仅自己）| ✅（所有员工）|
| 团队报告 | ❌ | ✅ |

### 3.2 中间件实现

```typescript
// middleware.ts
// 使用 NextAuth.js getToken() 验证 JWT
// 检查 user.role 是否满足路由权限要求
```

---

## 4. 错误码规范

| 错误码 | 说明 |
|---|---|
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 状态冲突（如重复审核）|
| 422 | 业务校验失败 |
| 429 | 请求频率超限 |
| 500 | 服务器内部错误 |
| 503 | LLM/ASR 服务不可用 |

---

## 5. Rate Limiting

| API 类别 | 限制 |
|---|---|
| 认证接口 | 5 次/分钟 |
| LLM 相关（出题、评分）| 10 次/分钟 |
| ASR 相关（语音转写）| 5 次/分钟 |
| 普通 CRUD | 60 次/分钟 |
