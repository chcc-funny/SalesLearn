---
title: SalesLearn - 组件库文档
category: design
tags: [组件库, UI组件, shadcn]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-21
status: active
---

# SalesLearn - 组件库文档

## 技术基础

基于 **shadcn/ui** + **TailwindCSS** 构建，按需扩展业务组件。

---

## 1. 基础组件（来自 shadcn/ui）

| 组件 | 用途 | 备注 |
|---|---|---|
| Button | 按钮 | 主要/次要/危险/幽灵 |
| Input | 输入框 | 文本/搜索/密码 |
| Card | 卡片 | 知识卡片、数据卡片 |
| Dialog | 对话框 | 确认操作、详情查看 |
| Tabs | 选项卡 | 分类切换 |
| Badge | 标签 | 状态标识、分类标签 |
| Avatar | 头像 | 用户头像 |
| Progress | 进度条 | 学习进度、测试进度 |
| Toast | 提示 | 操作反馈 |
| Table | 表格 | 主管端列表 |
| Select | 下拉选择 | 筛选、分类选择 |
| Skeleton | 骨架屏 | 加载占位 |

---

## 2. 业务组件

### 2.1 KnowledgeCard（知识卡片）

**用途**：展示单个知识点的学习卡片

**Props**：
```typescript
interface KnowledgeCardProps {
  title: string
  category: 'product' | 'objection' | 'closing' | 'psychology'
  keyPoints: string[]
  content: string
  examples: string
  isFavorited: boolean
  onFavorite: () => void
  onStartTest: () => void
}
```

**变体**：
- 学习模式：全屏可滑动
- 列表模式：缩略卡片

---

### 2.2 QuizOption（测试选项）

**用途**：测试题的单个选项

**Props**：
```typescript
interface QuizOptionProps {
  label: 'A' | 'B' | 'C' | 'D'
  text: string
  state: 'default' | 'selected' | 'correct' | 'incorrect' | 'correctAnswer'
  explanation?: string
  onSelect: () => void
}
```

---

### 2.3 RecordButton（录音按钮）

**用途**：费曼讲解的按住录音按钮

**Props**：
```typescript
interface RecordButtonProps {
  isRecording: boolean
  duration: number  // 录音时长（秒）
  onStart: () => void
  onStop: () => void
}
```

**交互**：
- 默认：圆形 + 麦克风图标
- 按住：放大 + 脉冲动画 + 显示时长
- 松开：恢复 + 转换处理状态

---

### 2.4 ScoreRadar（评分雷达图）

**用途**：展示费曼讲解四维评分

**Props**：
```typescript
interface ScoreRadarProps {
  scores: {
    completeness: number  // 完整度
    accuracy: number      // 准确度
    clarity: number       // 清晰度
    analogy: number       // 类比恰当度
  }
  size?: 'sm' | 'md' | 'lg'
}
```

---

### 2.5 KeyPointList（关键点列表）

**用途**：展示费曼评分中的关键点覆盖情况

**Props**：
```typescript
interface KeyPointListProps {
  covered: string[]    // ✅ 讲到的
  missed: string[]     // ⚠️ 遗漏的
  errors: string[]     // ❌ 讲错的
}
```

---

### 2.6 ChatBubble（对话气泡）

**用途**：AI 客户对话界面的消息气泡

**Props**：
```typescript
interface ChatBubbleProps {
  role: 'ai' | 'user'
  content: string
  persona?: 'beginner' | 'bargainer' | 'expert'  // AI 客户人设
  timestamp: Date
}
```

---

### 2.7 ReviewCard（错题复习卡片）

**用途**：错题本中的单条错题

**Props**：
```typescript
interface ReviewCardProps {
  knowledgeTitle: string
  lastErrorDate: Date
  nextReviewDate: Date
  correctStreak: number  // 连续正确次数（0-3）
  onReview: () => void
  onFeynman: () => void
}
```

---

### 2.8 StatusBadge（状态标签）

**用途**：知识点/题目的状态标识

**Props**：
```typescript
interface StatusBadgeProps {
  status: 'draft' | 'reviewing' | 'published' | 'rejected'
}
```

**样式映射**：
- draft：灰色
- reviewing：黄色
- published：绿色
- rejected：红色

---

## 3. 布局组件

### 3.1 AppLayout（应用布局）

员工端：底部 Tab 导航布局
主管端：侧边栏导航布局

### 3.2 SwipeableContainer（可滑动容器）

用于知识卡片的左右滑动浏览，支持手势操作。

### 3.3 BottomSheet（底部弹出面板）

用于移动端的详情展示、选项选择等场景。

---

## 4. 图标

使用 **Lucide React** 图标库（shadcn/ui 默认搭配）。

关键图标：
- `Mic` - 麦克风（录音）
- `BookOpen` - 书本（学习）
- `CheckCircle` - 打勾（通过）
- `XCircle` - 打叉（错误）
- `Star` - 星标（收藏）
- `BarChart` - 图表（看板）
- `Upload` - 上传（资料上传）
- `Search` - 搜索
