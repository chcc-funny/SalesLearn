---
title: SalesLearn - 数据库设计
category: architecture
tags: [数据库, Postgres, Neon, 表结构]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-21
status: active
---

# SalesLearn - 数据库设计

## 1. 数据库信息

- **数据库**：Neon (Postgres Serverless)
- **ORM**：Drizzle
- **多租户**：所有表包含 `tenant_id`（SaaS 预留）

---

## 2. ER 图（简版）

```
users ──────────────┐
  │                 │
  │ 1:N             │ 1:N
  ▼                 ▼
user_learning    user_test_records
_progress           │
                    │ N:1
                    ▼
knowledge_base ◄── questions
  │                 │
  │ 1:N             │
  ▼                 ▼
user_feynman     error_book
_records
```

---

## 3. 表结构设计

### 3.1 users（用户表）

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,           -- SaaS 多租户
  name          VARCHAR(100) NOT NULL,
  phone         VARCHAR(20),
  email         VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'employee',  -- employee / manager
  shop_id       UUID,                    -- 所属门店
  avatar_url    VARCHAR(500),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_role ON users(tenant_id, role);
```

### 3.2 knowledge_base（知识库表）

```sql
CREATE TABLE knowledge_base (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  title            VARCHAR(200) NOT NULL,
  category         VARCHAR(50) NOT NULL,  -- product / objection / closing / psychology
  key_points       JSONB NOT NULL DEFAULT '[]',  -- 核心要点数组
  content          TEXT NOT NULL,                  -- 详细说明
  examples         TEXT,                           -- 案例/话术示例
  common_mistakes  TEXT,                           -- 常见误区（出题干扰项来源）
  images           JSONB DEFAULT '[]',             -- 图片 URL 数组
  status           VARCHAR(20) DEFAULT 'draft',    -- draft / reviewing / published
  source_file_url  VARCHAR(500),                   -- 原始上传文件
  created_by       UUID REFERENCES users(id),
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_tenant_status ON knowledge_base(tenant_id, status);
CREATE INDEX idx_knowledge_category ON knowledge_base(tenant_id, category);
```

### 3.3 questions（题目表）

```sql
CREATE TABLE questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  knowledge_id    UUID NOT NULL REFERENCES knowledge_base(id),
  type            VARCHAR(30) NOT NULL,  -- memory / understanding / application / analysis
  question_text   TEXT NOT NULL,
  options         JSONB NOT NULL,         -- ["选项A", "选项B", "选项C", "选项D"]
  correct_answer  VARCHAR(1) NOT NULL,    -- A / B / C / D
  explanations    JSONB NOT NULL,         -- {"A": "解析", "B": "解析", ...}
  status          VARCHAR(20) DEFAULT 'reviewing',  -- reviewing / published / rejected
  quality_tag     VARCHAR(20),            -- premium（精品题，用于 few-shot）
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_questions_knowledge ON questions(knowledge_id, status);
CREATE INDEX idx_questions_tenant ON questions(tenant_id, status);
```

### 3.4 user_learning_progress（学习进度表）

```sql
CREATE TABLE user_learning_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  knowledge_id    UUID NOT NULL REFERENCES knowledge_base(id),
  view_duration   INTEGER DEFAULT 0,     -- 累计停留时长（秒）
  scroll_depth    REAL DEFAULT 0,        -- 滑动深度（0-1）
  is_completed    BOOLEAN DEFAULT false,
  is_favorited    BOOLEAN DEFAULT false,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, knowledge_id)
);
```

### 3.5 user_test_records（测试记录表）

```sql
CREATE TABLE user_test_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  question_id     UUID NOT NULL REFERENCES questions(id),
  selected_answer VARCHAR(1) NOT NULL,
  is_correct      BOOLEAN NOT NULL,
  time_spent      INTEGER,               -- 答题用时（秒）
  answered_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_test_records_user ON user_test_records(user_id, answered_at DESC);
CREATE INDEX idx_test_records_question ON user_test_records(question_id);
```

### 3.6 user_feynman_records（费曼讲解记录表）

```sql
CREATE TABLE user_feynman_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  knowledge_id    UUID NOT NULL REFERENCES knowledge_base(id),
  stage           VARCHAR(1) NOT NULL,    -- A / B
  audio_url       VARCHAR(500),           -- 录音文件 URL
  transcript      TEXT,                   -- 语音转写文本
  scores          JSONB,                  -- {"completeness": 85, "accuracy": 90, "clarity": 70, "analogy": 60}
  covered_points  JSONB,                  -- 讲到的关键点
  missed_points   JSONB,                  -- 遗漏的关键点
  errors          JSONB,                  -- 讲错的点
  ai_feedback     TEXT,                   -- AI 改进建议
  total_score     REAL,                   -- 加权总分
  persona         VARCHAR(20),            -- 阶段B客户人设: beginner / bargainer / expert
  chat_history    JSONB,                  -- 阶段B对话记录
  is_passed       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feynman_user ON user_feynman_records(user_id, knowledge_id, stage);
```

### 3.7 error_book（错题本表）

```sql
CREATE TABLE error_book (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  knowledge_id    UUID NOT NULL REFERENCES knowledge_base(id),
  question_id     UUID REFERENCES questions(id),
  next_review_at  TIMESTAMPTZ NOT NULL,
  review_count    INTEGER DEFAULT 0,
  correct_streak  INTEGER DEFAULT 0,      -- 连续正确次数（达到3移出）
  is_resolved     BOOLEAN DEFAULT false,  -- 已移出错题本
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, question_id)
);

CREATE INDEX idx_error_book_review ON error_book(user_id, is_resolved, next_review_at);
```

---

## 4. 索引策略

| 表 | 索引 | 用途 |
|---|---|---|
| users | tenant_id, role | 按租户和角色查询 |
| knowledge_base | tenant_id, status | 按状态筛选知识点 |
| knowledge_base | tenant_id, category | 按分类筛选 |
| questions | knowledge_id, status | 按知识点查找题目 |
| user_test_records | user_id, answered_at | 用户答题历史 |
| error_book | user_id, next_review_at | 查询待复习错题 |

---

## 5. 数据迁移策略

- 使用 ORM 自带的 migration 功能
- 每次 schema 变更创建 migration 文件
- 生产环境变更前在 staging 环境验证
- 保留 rollback migration

---

## 6. 备份策略

- Neon 自动每日备份
- 关键操作前手动创建 branch（Neon 分支功能）
- 保留 7 天的 point-in-time recovery
