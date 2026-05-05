### 判定: PASS

## unit35 - app/(admin)/admin/knowledge/[id]/page.tsx smoke

### 说明
unit35 改动无独立单测需求；按指令补 smoke 测试，验证：
1. 默认导出为 function 组件
2. 「标记为精选话术」按钮可渲染（关键改动元素）
3. 「返回列表」按钮可渲染

测试文件：tests/unit/_harness-batch12-pages.test.tsx

### 单测结果
- Test Files: 1 passed (1)
- Tests: 3 passed (3)
- Duration: 678ms

用例清单：
- admin/knowledge/[id]/page.tsx default export is a function
- renders 标记为精选话术 button after data loads
- renders 返回列表 button (header) after data loads

Mock：next/navigation（useParams/useRouter）、sonner（toast）、global.fetch 返回 fake KnowledgeDetail。

### 全量回归
- Test Files: 68 passed (68)
- Tests: 895 passed | 1 skipped (896)
- Duration: 6.98s
- 无 unit35 引入的回归

### 命令
```
pnpm vitest run tests/unit/_harness-batch12-pages.test.tsx
pnpm vitest run
```
