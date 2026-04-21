---
title: SalesLearn - 代码规范
category: development
tags: [代码规范, TypeScript, React, Next.js]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-21
status: active
---

# SalesLearn - 代码规范

## 1. 技术栈规范

- **语言**：TypeScript（strict mode）
- **前端**：React 18 + Next.js 14 App Router
- **样式**：TailwindCSS + shadcn/ui
- **格式化**：Prettier + ESLint
- **包管理**：pnpm

---

## 2. 命名规范

| 类型 | 规范 | 示例 |
|---|---|---|
| 文件名（组件）| PascalCase | `KnowledgeCard.tsx` |
| 文件名（工具）| camelCase | `formatDate.ts` |
| 文件名（路由）| kebab-case | `knowledge-detail/page.tsx` |
| 变量/函数 | camelCase | `getUserById` |
| 常量 | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| 类型/接口 | PascalCase | `KnowledgeBase` |
| CSS 类 | kebab-case | `card-container`（TailwindCSS 优先）|

---

## 3. 不可变性原则（CRITICAL）

始终创建新对象，绝不修改现有对象：

```typescript
// WRONG
user.score = 100
items.push(newItem)

// CORRECT
const updatedUser = { ...user, score: 100 }
const updatedItems = [...items, newItem]
```

---

## 4. 文件组织

- 单文件 200-400 行，最多不超过 800 行
- 函数不超过 50 行
- 嵌套不超过 4 层
- 按功能模块组织，不按文件类型

```
features/
├── knowledge/
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   └── types.ts
├── quiz/
├── feynman/
└── review/
```

---

## 5. 组件规范

### Server Components vs Client Components
- 默认使用 Server Components
- 仅在需要交互、状态、浏览器 API 时使用 `'use client'`
- Client Components 尽量小，提取到叶子节点

### 组件结构
```typescript
// 1. imports
// 2. types
// 3. component function
// 4. helper functions (if any)

interface Props {
  // ...
}

export function ComponentName({ prop1, prop2 }: Props) {
  // hooks
  // derived state
  // handlers
  // render
}
```

---

## 6. 错误处理

- API 路由：统一使用 try/catch + NextResponse
- 客户端：使用 Error Boundary + Toast 通知
- 表单：使用 Zod schema 验证
- 绝不静默吞掉错误

---

## 7. 类型安全

- 避免 `any`，优先使用 `unknown`
- API 响应使用 Zod 运行时校验
- 数据库查询结果使用 ORM 类型推导
- 共享类型定义放在 `types/` 目录

---

## 8. 环境变量

- 服务端变量：`VARIABLE_NAME`
- 客户端变量：`NEXT_PUBLIC_VARIABLE_NAME`
- 类型声明：`env.d.ts`
- 启动时验证必要环境变量存在
