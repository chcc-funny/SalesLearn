### 判定: PASS

## unit35 Lint

- **目标文件**：
  - `app/(admin)/admin/knowledge/[id]/page.tsx`（追加「标记为精选」按钮，调用 `/api/admin/scripts/from-knowledge`）
  - `tests/unit/_harness-batch12-pages.test.tsx`（Batch 12 页面快速校验）
- **命令**：`pnpm exec next lint --file <每个目标文件>`
- **结果**：`✔ No ESLint warnings or errors`
- **错误数**：0
- **警告数**：0
- **结论**：unit35（知识库切片「标记为精选」按钮联动）lint 全绿。
