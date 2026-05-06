### 判定: PASS

**unit38 — lib/services/scripts/rerank.ts**

---

## LLM 失败回退

**通过。** 三种降级场景全部处理：
1. `chatCompletionJSON` 抛异常 → catch 块捕获，`degraded=true`，原顺序返回。
2. `data` 为 null → 检测 `!data`，降级。
3. `scores` 非数组 → `!Array.isArray(data.scores)`，降级。

## API Key 处理

**通过。** `rerank.ts` 本身不涉及 API key；key 在 `lib/llm/openrouter.ts` 中从 `env.OPENROUTER_API_KEY`（`lib/env.ts` 封装的环境变量校验）读取，无硬编码。

## 候选 0/1 短路

**通过。** 空候选 `return { items: [], degraded: false }`；单候选直接返回，均不调 LLM。

## 复用现有 lib/llm

**通过。** 直接 import `chatCompletionJSON` 和 `LLM_MODELS`，无重复实现。Kimi K2 通过 `LLM_MODELS.KIMI_K2` 常量引用，未硬编码字符串。

## 评分 clamp

**通过。** `clamp01()` 处理越界（>1 → 1，<0 → 0，NaN → 0）；测试用例覆盖了 1.5 和 -0.3 两个边界值。

## 评分缺失处理

**通过。** 未被 LLM 评分的候选追加在 scored 之后，保持原顺序，不丢弃。

## 测试覆盖

**通过。** 12 个用例，覆盖：边界短路、成功重排、部分评分缺失、clamp、降级（抛错/非数组/null）、模型选择、temperature 约束、scene/product 透传。

## 轻微问题（LOW）

- `candidates.length === 1` 时直接返回原引用 `{ items: candidates, ... }`，而不是 `[...candidates]` 的浅拷贝。与代码库不可变性规范轻微不符，但实际不影响正确性（candidates 从 fulltext-search 返回，调用方不会修改）。

## 问题汇总

| 严重度 | 描述 |
|--------|------|
| LOW    | 单候选返回原引用而非副本，轻微违反不可变性原则 |

