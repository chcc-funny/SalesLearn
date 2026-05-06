---
title: SalesLearn - API 接口文档
category: api
tags: [API, 接口文档, REST]
version: 1.1.0
created: 2026-04-21
last_updated: 2026-04-22
status: active
---

# SalesLearn - API 接口文档

## 基础信息

| 项目 | 值 |
|---|---|
| Base URL | `https://saleslearn.aicarengine.com/api` |
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

> 各接口的详细设计（Request/Response 示例、处理流程）请参阅 [`architecture/api-routes.md`](../architecture/api-routes.md)。

### 1. 认证 (`/api/auth`)

NextAuth.js 标准认证端点，支持员工/主管双角色登录。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | NextAuth 标准端点（登录、登出、回调、Session 等） |

### 2. 知识库 (`/api/knowledge`)

知识点的 CRUD、文件上传、AI 切分、审核流程。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/knowledge` | 知识点列表（分页 + 状态筛选 + 分类筛选 + 搜索） |
| POST | `/api/knowledge` | 创建知识点（参数校验 + tenant_id 注入） |
| GET | `/api/knowledge/[id]` | 知识点详情 |
| PUT | `/api/knowledge/[id]` | 更新知识点（支持 status 字段） |
| DELETE | `/api/knowledge/[id]` | 删除知识点 |
| PATCH | `/api/knowledge/batch` | 批量操作（发布/删除/改分类） |
| POST | `/api/knowledge/upload` | 文件上传 + AI 切分触发 |
| GET | `/api/knowledge/tasks/[taskId]` | 切分任务进度查询 |
| POST | `/api/knowledge/[id]/review` | 审核（通过/驳回） |

### 3. 测试 (`/api/quiz`)

AI 出题、题目管理、审核、答题判分。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/quiz` | 题目列表 |
| POST | `/api/quiz` | 创建题目 |
| POST | `/api/quiz/generate` | AI 出题（Kimi K2 via OpenRouter） |
| GET | `/api/quiz/by-knowledge/[knowledgeId]` | 获取知识点已发布题目 |
| POST | `/api/quiz/[id]/review` | 题目审核 |
| POST | `/api/quiz/answer` | 提交答案（判分 + 错题入库） |

### 4. 学习 (`/api/learning`)

学习进度跟踪与统计。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/learning/progress` | 学习进度统计 |

### 5. 错题本 (`/api/review`)

错题列表查询、间隔复习更新。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/review/list` | 错题本列表（按间隔排序 + 待复习筛选） |
| POST | `/api/review/update` | 复习结果更新（连对 3 次移出） |

### 6. 费曼讲解 (`/api/feynman`)

录音上传、语音转写、AI 评分、讲解记录。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/feynman/upload-audio` | 音频上传（max 25MB） |
| POST | `/api/feynman/transcribe` | 语音转文字（腾讯云 ASR） |
| POST | `/api/feynman/evaluate` | AI 评分（Claude Sonnet via OpenRouter，四维评分） |
| GET | `/api/feynman/records` | 费曼讲解记录 |

### 7. 报告 (`/api/report`)

> Phase 5 计划中，尚未实现。

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

---

## 知识库 API 详细说明

### GET /api/knowledge - 列表查询 + 搜索

**查询参数**：
```
?page=1&limit=20&status=published&category=product&q=搜索关键词
```

- `q` (可选)：按 title 模糊搜索（ILIKE，自动转义通配符 `%/_/\\`）
- `status` (可选)：筛选状态（draft / reviewing / published / rejected）
- `category` (可选)：筛选分类（product / service 等）
- `page`, `limit`：分页参数

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "量子膜产品介绍",
      "status": "published",
      "category": "product",
      "reviewedBy": "manager_id",
      "reviewedAt": "2026-04-28T10:00:00Z"
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

### PUT /api/knowledge/[id] - 更新（支持直接发布）

**请求体**：
```json
{
  "title": "新标题",
  "category": "product",
  "content": "内容",
  "keyPoints": ["点1", "点2"],
  "status": "draft"  // 可选：draft / reviewing / published
}
```

- `status=published` 时，API 自动填充 `reviewedBy`（当前用户）和 `reviewedAt`（当前时间）
- 请求会强制绑定 `WHERE tenant_id = current_tenant_id`（防御性检查）
- 权限：manager 角色

**响应**：更新后的完整对象，包含 `reviewedBy` 和 `reviewedAt`（如适用）

### PATCH /api/knowledge/batch - 批量操作

**请求体示例（发布）**：
```json
{
  "action": "publish",
  "ids": ["uuid1", "uuid2"],
  "payload": {}
}
```

**请求体示例（改分类）**：
```json
{
  "action": "setCategory",
  "ids": ["uuid1", "uuid2"],
  "payload": { "category": "service" }
}
```

**请求体示例（删除）**：
```json
{
  "action": "delete",
  "ids": ["uuid1", "uuid2"],
  "payload": {}
}
```

**限制**：
- `ids` 数组长度 1-100
- 所有 id 必须是有效 UUID
- 所有操作强制绑定 `WHERE tenant_id = current_tenant_id`

**错误处理**：
- FK 错误（如删除有依赖项）返回 409，明确提示"整批操作已回滚，请检查依赖关系"
- 部分 id 无效返回 400，详细说明失败原因

**响应**：
```json
{
  "success": true,
  "data": {
    "affected": 2
  }
}
```

**权限**：manager 角色
