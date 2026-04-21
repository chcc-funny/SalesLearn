---
title: SalesLearn - API 接口文档
category: api
tags: [API, 接口文档, REST]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-21
status: active
---

# SalesLearn - API 接口文档

## 基础信息

| 项目 | 值 |
|---|---|
| Base URL | `https://saleslearn.vercel.app/api` |
| 协议 | HTTPS |
| 数据格式 | JSON |
| 认证方式 | Bearer Token (JWT via NextAuth.js) |
| 字符编码 | UTF-8 |

---

## 通用规范

### 请求头
```
Content-Type: application/json
Authorization: Bearer <token>
```

### 响应格式
```json
// 成功
{
  "success": true,
  "data": { ... },
  "meta": {              // 分页时返回
    "total": 100,
    "page": 1,
    "limit": 20
  }
}

// 失败
{
  "success": false,
  "error": {
    "code": 400,
    "message": "具体错误信息"
  }
}
```

### 分页参数
```
?page=1&limit=20&sort=created_at&order=desc
```

### 筛选参数
```
?category=product&status=published&search=关键词
```

---

## 错误码

| HTTP 状态码 | 说明 | 常见原因 |
|---|---|---|
| 200 | 成功 | - |
| 201 | 创建成功 | POST 创建资源 |
| 400 | 请求错误 | 参数缺失或格式错误 |
| 401 | 未认证 | Token 缺失或过期 |
| 403 | 无权限 | 角色权限不足 |
| 404 | 未找到 | 资源不存在 |
| 409 | 冲突 | 重复操作 |
| 422 | 校验失败 | 业务逻辑校验不通过 |
| 429 | 请求过多 | 超过频率限制 |
| 500 | 服务器错误 | 内部异常 |
| 503 | 服务不可用 | LLM/ASR 服务异常 |

---

## API 分组

> 本文档为 API 入口导航。各接口的详细设计（Request/Response 示例、处理流程）请参阅 [`architecture/api-routes.md`](../architecture/api-routes.md)。

### 1. 认证 (`/api/auth`)
详见 NextAuth.js 文档，提供标准的认证端点。

### 2. 知识库 (`/api/knowledge`)
知识点的 CRUD、文件上传、AI 切分、审核。
详见 `@docs/architecture/api-routes.md`

### 3. 测试 (`/api/quiz`)
AI 出题、题目审核、答题记录。
详见 `@docs/architecture/api-routes.md`

### 4. 费曼讲解 (`/api/feynman`)
录音上传、语音转写、AI 评分、客户对话。
详见 `@docs/architecture/api-routes.md`

### 5. 错题本 (`/api/review`)
错题列表、间隔复习更新。

### 6. 报告 (`/api/report`)
个人评估数据、团队看板数据。

---

## Rate Limiting

| API 类别 | 频率限制 |
|---|---|
| 认证接口 | 5 次/分钟 |
| LLM 相关 | 10 次/分钟 |
| ASR 相关 | 5 次/分钟 |
| 普通 CRUD | 60 次/分钟 |

超过限制返回 `429 Too Many Requests`，响应头包含：
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1619000000
```
