### 判定: PASS

## Batch 13 / unit38 - Typecheck

**目标文件**:
- `lib/services/scripts/rerank.ts`
- `tests/unit/scripts-rerank.test.ts`

## 命令

```bash
npx tsc --noEmit
```

## 结果

- 全项目 typecheck 输出 102 行（baseline，已豁免）
- 过滤 `scripts/rerank` / `scripts-rerank`：**0 条错误**

## Baseline 错误（豁免，与本批文件无关）

- `tests/e2e/fixtures/auth.ts` - Playwright fixtures
- `tests/integration/feynman-evaluate.test.ts`
- `tests/integration/quiz-answer.test.ts` - Request vs NextRequest
- `tests/unit/api-response.test.ts` / `rate-limit.test.ts` / `utils.test.ts` - vitest 全局
- `tests/unit/auth-options.test.ts` - JWT/Session 扩展
- `tests/unit/split-knowledge.test.ts` - drizzle 类型 cast

## 结论

unit38 文件 **0 typecheck 错误**，PASS。
