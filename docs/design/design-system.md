---
title: SalesLearn - 设计系统规范
category: design
tags: [设计系统, UI规范, 色彩, 字体, Anthropic风格]
version: 1.0.0
created: 2026-04-21
last_updated: 2026-04-21
status: active
---

# SalesLearn - 设计系统规范

## 1. 设计理念

SalesLearn 采用 **Anthropic 风格**设计语言：温暖、专业、以人为本。

**核心原则**：
- **温暖可信**：暖色调传递亲切感，降低员工学习压力
- **简洁聚焦**：去除视觉噪音，让内容成为主角
- **人文关怀**：设计服务于人，而非炫技
- **优雅克制**：少即是多，每个元素都有存在的理由

---

## 2. 色彩系统

### 2.1 主色调（Warm Terracotta）

```
Primary-50:  #FFF5F0  (最浅，背景高亮)
Primary-100: #FFE8DC  (浅色背景)
Primary-200: #FFD0B8  (Hover 状态)
Primary-300: #FFB08A  (次要元素)
Primary-400: #E8845A  (Active 状态)
Primary-500: #D97757  (标准主色 ★)
Primary-600: #C4633F  (深色文字/图标)
Primary-700: #A34E2E  (强调)
Primary-800: #7D3A20  (深色背景上的主色)
Primary-900: #5C2A16  (最深)
```

### 2.2 语义色

```
Success:     #16A34A  (通过、正确、已发布)
Success-bg:  #F0FDF4  (成功背景)
Warning:     #CA8A04  (提醒、待审核)
Warning-bg:  #FEFCE8  (警告背景)
Error:       #DC2626  (错误、打回、讲错)
Error-bg:    #FEF2F2  (错误背景)
Info:        #2563EB  (信息提示)
Info-bg:     #EFF6FF  (信息背景)
```

### 2.3 中性色（Warm Neutral）

```
Background:      #FAFAF7  (页面背景，温暖奶白)
Surface:         #FFFFFF  (卡片/面板表面)
Surface-muted:   #F5F5F0  (次要表面)
Border:          #E8E5DE  (边框，温暖灰)
Border-strong:   #D4D0C8  (强调边框)
Text-primary:    #1C1917  (主文字，温暖黑)
Text-secondary:  #78716C  (次要文字，石灰)
Text-tertiary:   #A8A29E  (辅助文字)
Text-disabled:   #D6D3D1  (禁用文字)
Text-on-primary: #FFFFFF  (主色上的文字)
```

### 2.4 特殊场景色

```
Feynman-stage-a: #D97757  (费曼阶段A，主色)
Feynman-stage-b: #7C3AED  (费曼阶段B，紫色代表进阶)
Quiz-correct:    #16A34A  (答对)
Quiz-incorrect:  #DC2626  (答错)
Radar-complete:  #D97757  (完整度)
Radar-accurate:  #2563EB  (准确度)
Radar-clear:     #16A34A  (清晰度)
Radar-analogy:   #CA8A04  (类比恰当度)
```

---

## 3. 字体

### 3.1 字体族

```css
--font-sans: "Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-mono: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
```

### 3.2 字号规范

| 用途 | 大小 | 行高 | 字重 | 字间距 |
|---|---|---|---|---|
| 页面大标题 | 28px | 36px | 700 | -0.02em |
| 页面标题 | 24px | 32px | 600 | -0.01em |
| 卡片标题 | 18px | 28px | 600 | 0 |
| 小标题 | 16px | 24px | 500 | 0 |
| 正文 | 14px | 22px | 400 | 0 |
| 辅助文字 | 12px | 18px | 400 | 0.01em |
| 按钮文字 | 14px | 20px | 500 | 0.01em |
| 标签文字 | 12px | 16px | 500 | 0.02em |

---

## 4. 间距系统

基于 4px 基础单位，遵循 Anthropic 风格的宽松舒适间距：

```
space-0.5: 2px
space-1:   4px
space-2:   8px
space-3:   12px
space-4:   16px
space-5:   20px
space-6:   24px
space-8:   32px
space-10:  40px
space-12:  48px
space-16:  64px
space-20:  80px
```

**间距原则**：
- 组件内部间距：space-3 ~ space-4
- 组件之间间距：space-6 ~ space-8
- 区域之间间距：space-10 ~ space-16
- 页面边距（移动端）：space-4 (16px)
- 页面边距（桌面端）：space-8 (32px)

---

## 5. 圆角

Anthropic 风格偏好**中等圆角**，传递温和感：

```
rounded-sm:   6px   (按钮、输入框、标签)
rounded-md:   10px  (卡片、对话框)
rounded-lg:   14px  (大卡片、面板)
rounded-xl:   18px  (模态框、底部面板)
rounded-2xl:  24px  (特殊容器)
rounded-full: 9999px (头像、圆形按钮)
```

---

## 6. 阴影

温暖色调阴影，避免冷灰色阴影：

```
shadow-xs:  0 1px 2px rgba(28, 25, 23, 0.04)
shadow-sm:  0 2px 4px rgba(28, 25, 23, 0.06)
shadow-md:  0 4px 8px rgba(28, 25, 23, 0.08),
            0 1px 2px rgba(28, 25, 23, 0.04)
shadow-lg:  0 8px 16px rgba(28, 25, 23, 0.10),
            0 2px 4px rgba(28, 25, 23, 0.04)
shadow-xl:  0 16px 32px rgba(28, 25, 23, 0.12),
            0 4px 8px rgba(28, 25, 23, 0.04)
```

**使用场景**：
- 卡片默认：shadow-sm
- 卡片 Hover：shadow-md
- 弹窗/模态框：shadow-lg
- 底部面板：shadow-xl

---

## 7. 动画

克制而精致的微动效：

```
duration-instant: 100ms  (颜色变化、opacity)
duration-fast:    200ms  (hover、focus 状态)
duration-normal:  300ms  (展开/收起、滑入)
duration-slow:    500ms  (页面切换、大面积变化)

easing-default:   cubic-bezier(0.25, 0.1, 0.25, 1.0)   (通用)
easing-in:        cubic-bezier(0.4, 0, 1, 1)             (退出)
easing-out:       cubic-bezier(0, 0, 0.2, 1)             (进入)
easing-spring:    cubic-bezier(0.34, 1.56, 0.64, 1)      (弹性，录音按钮)
```

**动画原则**：
- 保持克制，不做纯装饰性动画
- 录音按钮脉冲：使用 easing-spring
- 卡片切换：水平滑入 300ms
- 评分结果：数字递增动画 500ms

---

## 8. 组件样式规范

### 8.1 知识卡片
- 背景：`#FFFFFF` (Surface)
- 圆角：14px (rounded-lg)
- 阴影：shadow-sm → hover: shadow-md
- 内边距：20px
- 边框：1px solid `#E8E5DE`
- 标题颜色：`#1C1917` (Text-primary)
- 分类标签：Primary-100 背景 + Primary-700 文字

### 8.2 测试题选项
- 未选中：Surface + Border `#E8E5DE` + rounded-md
- 选中：Primary-50 背景 + Primary-500 边框 + 左侧 3px Primary-500 色带
- 正确：Success-bg + Success 边框 + 左侧 3px Success 色带
- 错误：Error-bg + Error 边框 + 左侧 3px Error 色带
- 正确答案提示：Success 虚线边框（答错时标注正确项）

### 8.3 录音按钮
- 常态：64x64px 圆形，Primary-500 背景，白色麦克风图标
- 按住：放大至 72x72px，Primary-600 背景，外圈脉冲光晕（Primary-200, opacity 0.4）
- 松开：缩回 64px，转为 Surface-muted 背景 + 加载旋转
- 处理中：骨架屏文本区域

### 8.4 评分展示
- 雷达图：四维使用专属颜色（Radar-complete/accurate/clear/analogy）
- 分数数字：28px 字号，递增动画
- 颜色编码：≥80 Success / 60-79 Warning / <60 Error
- 关键点卡片：Surface 背景，左侧 3px 色带（绿/黄/红）

### 8.5 对话气泡
- AI 消息：Surface-muted 背景，rounded-lg，左下角无圆角
- 用户消息：Primary-500 背景，白色文字，rounded-lg，右下角无圆角
- 客户人设标签：相应颜色的 Badge

### 8.6 按钮

| 变体 | 背景 | 文字 | 边框 | Hover |
|---|---|---|---|---|
| Primary | Primary-500 | 白色 | 无 | Primary-600 |
| Secondary | Surface | Text-primary | Border | Surface-muted |
| Ghost | 透明 | Text-secondary | 无 | Surface-muted |
| Danger | Error | 白色 | 无 | #B91C1C |
| Link | 透明 | Primary-500 | 无 | Primary-600 + 下划线 |

---

## 9. 响应式断点

```
mobile:  < 640px    (员工端主要使用场景)
tablet:  640-1024px (员工端横屏/平板)
desktop: > 1024px   (主管端主要使用场景)
```

**适配策略**：
- 移动端优先（Mobile-first）
- 员工端：针对移动端优化，桌面端自适应
- 主管端：针对桌面端优化，提供基本移动端适配

---

## 10. 无障碍

- **对比度**：文字与背景至少 4.5:1（Primary-500 在白色上对比度 4.6:1）
- **焦点指示**：键盘操作时显示 2px Primary-500 焦点环 + 2px offset
- **触控区域**：最小 44x44px
- **语义化 HTML**：正确的 heading 层级和 ARIA 标签
- **颜色不依赖**：状态信息同时使用颜色 + 图标/文字

---

## 11. TailwindCSS 配置参考

```typescript
// tailwind.config.ts 关键配置
const config = {
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#FFF5F0',
          100: '#FFE8DC',
          200: '#FFD0B8',
          300: '#FFB08A',
          400: '#E8845A',
          500: '#D97757',
          600: '#C4633F',
          700: '#A34E2E',
          800: '#7D3A20',
          900: '#5C2A16',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F5F5F0',
        },
        background: '#FAFAF7',
        border: {
          DEFAULT: '#E8E5DE',
          strong: '#D4D0C8',
        },
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '24px',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
    },
  },
}
```
