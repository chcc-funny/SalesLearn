---
title: 精选话术 - 实施进度
category: feature-progress
tags: [话术库, 进度跟踪]
version: 0.1.0
created: 2026-05-01
last_updated: 2026-05-01
status: active
---

# 精选话术 - 实施进度

> 方案文档：[`README.md`](./README.md)
> 状态图例：🔲 未开始 / 🟡 进行中 / ✅ 完成 / ⏸ 暂停 / ❌ 阻塞

---

## 总览

| 阶段 | 状态 | 起止 | 备注 |
|---|---|---|---|
| 方案设计 | ✅ | 2026-05-01 | README.md v0.1 |
| Subagent 评审 | ✅ | 2026-05-01 | architect + code-reviewer，CRITICAL/HIGH 全部并入 v0.2 |
| 方案 v0.2 修订 | ✅ | 2026-05-01 | 中文分词改 pg_trgm、JSONB→多对多、状态机闭合、Prompt Injection 防护、跨租户 FK、文件拆分 |
| Phase 1 - MVP | 🔲 | — | 浏览/复制/CRUD/标签管理 |
| Phase 2 - AI 闭环 | 🔲 | — | 生成 + 提交审核 |
| Phase 3 - 演进 | 🔲 | — | 向量检索/收藏 |

---

## Phase 1 - MVP 任务清单

### 数据层
- [ ] 创建 `lib/db/schema/scripts.ts`（含状态机字段、deleted_at、CHECK 约束）
- [ ] 创建 `lib/db/schema/script-tags.ts`
- [ ] 创建 `lib/db/schema/script-tag-relations.ts`（多对多）
- [ ] 创建 `lib/db/schema/script-copy-logs.ts`
- [ ] Drizzle 迁移文件 + `CREATE EXTENSION IF NOT EXISTS pg_trgm`
- [ ] seed 初始标签（场景 7 + 产品 5）
- [ ] [VERIFY] `pnpm drizzle-kit migrate` 成功 + Neon 中表与 trgm 索引存在

### 验证 / 服务层
- [ ] `lib/validations/script.ts`（zod）
- [ ] `lib/validations/script-tag.ts`
- [ ] 单元测试 `tests/unit/validations-script.test.ts`

### API（员工端）
- [ ] `GET /api/scripts` 列表（筛选/搜索/分页）
- [ ] `GET /api/scripts/:id`
- [ ] `POST /api/scripts/:id/copy`
- [ ] `GET /api/scripts/tags`
- [ ] 集成测试 `tests/integration/scripts-list.test.ts`
- [ ] 集成测试 `tests/integration/scripts-copy.test.ts`

### API（管理端）
- [ ] `GET/POST /api/admin/scripts`
- [ ] `PUT/DELETE /api/admin/scripts/:id`
- [ ] `POST /api/admin/scripts/from-knowledge`
- [ ] `GET/POST /api/admin/script-tags`
- [ ] `PUT/DELETE /api/admin/script-tags/:id`
- [ ] 集成测试（含跨租户隔离）

### 页面（员工端）
- [ ] `app/(employee)/scripts/page.tsx`：列表 + 筛选 + 搜索
- [ ] `components/scripts/script-card.tsx`：卡片 + 复制按钮
- [ ] 主导航追加「精选话术」入口
- [ ] [VERIFY] Chrome 截图：列表渲染、筛选生效、复制 toast、移动端 375px

### 页面（管理端）
- [ ] `app/(admin)/admin/scripts/page.tsx`：列表 + Tab 状态切换
- [ ] `app/(admin)/admin/scripts/[id]/edit/page.tsx`
- [ ] `components/admin/scripts/script-form.tsx`
- [ ] `app/(admin)/admin/scripts/tags/page.tsx`：标签管理
- [ ] 知识库切片「标记为精选」按钮联动
- [ ] [VERIFY] Chrome E2E：新增 → 发布 → 员工端可见

---

## Phase 2 - AI 闭环任务清单

### 服务层
- [ ] `lib/services/script-search.ts`：FTS + LLM 重排（Kimi）
- [ ] `lib/services/script-generate.ts`：兜底生成（Claude Sonnet）
- [ ] 单元测试：相关性打分、阈值判断

### API
- [ ] `POST /api/scripts/generate`：检索 + 兜底
- [ ] `POST /api/scripts/submit`：员工提交 AI 答案
- [ ] `POST /api/admin/scripts/:id/review`：审核（approve/reject）
- [ ] 集成测试 `tests/integration/scripts-generate.test.ts`
- [ ] 集成测试 `tests/integration/scripts-review.test.ts`

### 页面
- [ ] `components/scripts/generate-dialog.tsx`：粘贴问题弹窗
- [ ] 管理端「待审核」Tab + 审核界面
- [ ] [VERIFY] Chrome E2E：粘贴问题 → 命中精选 / 未命中生成 → 提交 → 主管审核 → 发布

---

## 当前阻塞 / 待决

- 暂无

---

## 变更记录

| 日期 | 变更 | 作者 |
|---|---|---|
| 2026-05-01 | 初版方案 v0.1 + 进度跟踪建立 | Claude |
| 2026-05-01 | v0.2：吸纳 architect + code-reviewer 评审，修复 6 项 CRITICAL/HIGH | Claude |
