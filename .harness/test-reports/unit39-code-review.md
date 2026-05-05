### 判定: PASS

**unit39 — lib/services/scripts/knowledge-retrieval.ts**

#### SQL 参数化
使用 drizzle-orm 的 `sql\`\`` 模板标签 + `eq()` 构造所有条件，`trimmed` 作为参数传入 `similarity()` 和 `%`，不存在字符串拼接。SQL 注入防护合格。

#### 多租户隔离
`eq(knowledgeBase.tenantId, input.tenantId)` 强制在每条查询中附带租户过滤，且仅返回 `status='published'` 记录，隔离合格。

#### 裁剪策略
`trimChunkContent` 使用 `text.slice(0, MAX_CHUNK_LENGTH)`，按字符数硬截，不做按词/句切割。800 字裁剪不会在词中间（JS `slice` 按 UTF-16 code unit，中文单字 = 1 unit），对中文无破坏性。中文场景基本可接受；若未来处理长英文单词可能截断词中间，但 v1 场景（汽车美容中文语境）风险极低，不构成高级别问题。

#### 其他
- 空 query 短路正确
- limit 钳位逻辑完整 `[1, 50]`
- `null` content 处理正确（转空字符串）
- DB 异常向上传播，不吞错

#### 测试覆盖
15 个用例，覆盖空 query / 空白 query / 默认 limit / 自定义 limit / limit 下越界 / limit 上越界 / 多租户隔离 / 排序调用 / 超长裁剪 / 短内容不裁剪 / null content / SQL 注入字符 / DB 抛错传播，路径全覆盖。

**无 CRITICAL / HIGH 问题。**
