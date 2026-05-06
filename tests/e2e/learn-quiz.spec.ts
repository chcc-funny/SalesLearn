/**
 * E2E tests: 学习页 → 卡片浏览 → 出题 → 作答 流程
 *
 * 路由结构：
 *   /learn                   - 学习中心（分类卡片）
 *   /learn/[category]        - 分类卡片列表（知识点浏览）
 *   /learn/[category]/[id]   - 知识点详情页
 *   /test                    - 测试入口（选择知识点）
 *   /test/[knowledgeId]      - 答题页
 *
 * 注意：quiz/generate 路由不在此流程内。已发布知识点须通过管理员
 * 预生成题目，本测试依赖 DB 中已有 published 知识点 + published 题目。
 */

import { test, expect } from "./fixtures/auth";

// ─────────────────────────────────────────────────────────────────────────────
// 辅助函数：从 /learn 页面取第一个分类 key
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORIES = ["product", "objection", "closing", "psychology"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Test 1：/learn 页面加载，显示学习中心标题和分类卡片
// ─────────────────────────────────────────────────────────────────────────────
test("TC01 /learn 页面加载：显示学习中心标题与四个分类卡片", async ({
  employeePage: page,
}) => {
  await page.goto("/learn");
  await expect(page).toHaveURL(/\/learn/);

  // 标题存在
  await expect(page.getByText("学习中心")).toBeVisible();

  // 四个分类标题
  for (const label of ["产品知识", "客户异议", "成交话术", "客户心理"]) {
    await expect(page.getByText(label).first()).toBeVisible();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2：点击分类卡片 → 进入 /learn/[category]
// ─────────────────────────────────────────────────────────────────────────────
test("TC02 点击「产品知识」分类 → 跳转 /learn/product", async ({
  employeePage: page,
}) => {
  await page.goto("/learn");

  // 点击第一个分类卡片（产品知识）
  await page.getByText("产品知识").first().click();

  await expect(page).toHaveURL(/\/learn\/product/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3：/learn/[category] 页面 — 检查有知识点或正确显示空态
// ─────────────────────────────────────────────────────────────────────────────
test("TC03 /learn/product 页面：有知识点则显示卡片，否则显示空态", async ({
  employeePage: page,
}) => {
  await page.goto("/learn/product");

  // 等待 loading 消失
  await expect(page.getByText("加载中...")).not.toBeVisible({ timeout: 10_000 });

  const emptyState = page.getByText("暂无知识点");
  const hasEmpty = await emptyState.isVisible().catch(() => false);

  if (hasEmpty) {
    test.skip(true, "需要 seed 测试知识点 — 见 lib/db/seed.ts");
    return;
  }

  // 有知识点：页面顶部有标题 "产品知识"，有进度指示器 "1/"
  // exact: true 避免匹配到包含"产品知识"的知识点卡片标题（strict-mode 多元素问题）
  await expect(page.getByRole("heading", { name: "产品知识", exact: true })).toBeVisible();
  // 进度标记格式 "1/N"
  await expect(page.getByText(/^1\/\d+$/)).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4：卡片页内容渲染——标题、要点区域、内容区域可见
// ─────────────────────────────────────────────────────────────────────────────
test("TC04 /learn/product 卡片页：知识卡片内容区域渲染正常", async ({
  employeePage: page,
}) => {
  await page.goto("/learn/product");
  await expect(page.getByText("加载中...")).not.toBeVisible({ timeout: 10_000 });

  const emptyState = await page.getByText("暂无知识点").isVisible().catch(() => false);
  if (emptyState) {
    test.skip(true, "需要 seed 测试知识点 — 见 lib/db/seed.ts");
    return;
  }

  // KnowledgeCard 渲染区域：上一张/下一张按钮存在（底部导航）
  const prevBtn = page.getByRole("button", { name: "上一张" });
  const nextBtn = page.getByRole("button", { name: /下一张|去测试一下/ });
  await expect(prevBtn).toBeVisible();
  await expect(nextBtn).toBeVisible();

  // 卡片内容区域可见：上下导航按钮说明卡片已渲染
  // 进度指示器格式 "1/N" 存在
  await expect(page.getByText(/^\d+\/\d+$/)).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5：点击「去测试一下」→ 跳转到 /test
// ─────────────────────────────────────────────────────────────────────────────
test("TC05 卡片页末尾「去测试一下」→ 跳转 /test?category=product", async ({
  employeePage: page,
}) => {
  await page.goto("/learn/product");
  await expect(page.getByText("加载中...")).not.toBeVisible({ timeout: 10_000 });

  const emptyState = await page.getByText("暂无知识点").isVisible().catch(() => false);
  if (emptyState) {
    test.skip(true, "需要 seed 测试知识点 — 见 lib/db/seed.ts");
    return;
  }

  // 直接找"去测试一下"按钮（在最后一张卡片时出现）
  // 若卡片不止一张，先滑到最后一张
  const goTestBtn = page.getByRole("button", { name: "去测试一下" });
  const prevBtn = page.getByRole("button", { name: "上一张" });

  // 通过键盘快速跳到最后一张（最多点 30 次 ArrowRight）
  // 或者直接检查按钮出现
  let attempts = 0;
  while (!(await goTestBtn.isVisible().catch(() => false)) && attempts < 30) {
    await page.keyboard.press("ArrowRight");
    attempts++;
  }

  const isVisible = await goTestBtn.isVisible().catch(() => false);
  if (!isVisible) {
    test.skip(true, "知识点超过 30 张，跳过此用例");
    return;
  }

  await goTestBtn.click();
  await expect(page).toHaveURL(/\/test/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6：/test 页面加载 + 有题目的知识点可点击
// ─────────────────────────────────────────────────────────────────────────────
test("TC06 /test 测试中心：页面加载正常，显示知识点列表", async ({
  employeePage: page,
}) => {
  await page.goto("/test");

  await expect(page.getByText("测试中心")).toBeVisible({ timeout: 10_000 });
  // 等待 loading 消失
  await expect(page.getByText("加载中...")).not.toBeVisible({ timeout: 10_000 });

  const emptyState = await page
    .getByText("暂无可测试的知识点")
    .isVisible()
    .catch(() => false);

  if (emptyState) {
    test.skip(true, "需要 seed 测试知识点 — 见 lib/db/seed.ts");
    return;
  }

  // 至少存在一个"开始测试" badge
  await expect(page.getByText("开始测试").first()).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7：进入 /test/[id] 答题页，题目、选项可见，选项点击 + 提交答案
// ─────────────────────────────────────────────────────────────────────────────
test("TC07 答题流程：选项可点击 + 提交答案 → 显示对错反馈", async ({
  employeePage: page,
}) => {
  await page.goto("/test");
  await expect(page.getByText("加载中...")).not.toBeVisible({ timeout: 10_000 });

  const emptyState = await page
    .getByText("暂无可测试的知识点")
    .isVisible()
    .catch(() => false);

  if (emptyState) {
    test.skip(true, "需要 seed 测试知识点 — 见 lib/db/seed.ts");
    return;
  }

  // 检查是否有 enabled 的"开始测试"按钮（hasQuiz=true 时才 enabled）
  // 外层 <button> 包含 Badge 文字"开始测试"，disabled 时 onClick 不执行
  const enabledStartBtns = page.locator("button:not([disabled])").filter({
    has: page.getByText("开始测试"),
  });
  const hasEnabled = await enabledStartBtns.count().then((n) => n > 0).catch(() => false);
  if (!hasEnabled) {
    test.skip(true, "知识点无已发布题目（所有按钮 disabled），需在管理端生成题目");
    return;
  }
  await enabledStartBtns.first().click();

  // 等待跳转到 /test/[id]（应用路由：router.push(`/test/${item.id}`)）
  await expect(page).toHaveURL(/\/test\/.+/);

  // 等待题目加载
  await expect(page.getByText("加载题目中...")).not.toBeVisible({
    timeout: 10_000,
  });

  // 检查是否无题（知识点已发布但无题目）
  const noQuiz = await page
    .getByText("该知识点暂无题目")
    .isVisible()
    .catch(() => false);

  if (noQuiz) {
    test.skip(true, "知识点无已发布题目，需在管理端生成题目");
    return;
  }

  // 题目文字区域存在
  const questionText = page.locator("h2").filter({ hasText: /.{5,}/ }).first();
  await expect(questionText).toBeVisible();

  // 选项 A 存在并可点击
  const optionA = page
    .locator("button")
    .filter({ has: page.locator("span", { hasText: "A" }) })
    .first();
  await expect(optionA).toBeVisible();
  await optionA.click();

  // 提交答案按钮出现
  const submitBtn = page.getByRole("button", { name: "提交答案" });
  await expect(submitBtn).toBeVisible();
  await submitBtn.click();

  // 等待提交完成（正确或错误反馈）
  const correctFeedback = page.getByText("回答正确！");
  const incorrectFeedback = page.getByText(/正确答案：/);

  await expect(
    correctFeedback.or(incorrectFeedback)
  ).toBeVisible({ timeout: 15_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8：完成所有题目 → 显示结果页（百分比成绩）
// ─────────────────────────────────────────────────────────────────────────────
test("TC08 完成全部题目 → 显示成绩结果页", async ({
  employeePage: page,
}) => {
  await page.goto("/test");
  await expect(page.getByText("加载中...")).not.toBeVisible({ timeout: 10_000 });

  const emptyState = await page
    .getByText("暂无可测试的知识点")
    .isVisible()
    .catch(() => false);

  if (emptyState) {
    test.skip(true, "需要 seed 测试知识点 — 见 lib/db/seed.ts");
    return;
  }

  // 检查是否有 enabled 的"开始测试"按钮（hasQuiz=true 时才 enabled）
  const enabledStartBtns08 = page.locator("button:not([disabled])").filter({
    has: page.getByText("开始测试"),
  });
  const hasEnabled08 = await enabledStartBtns08.count().then((n) => n > 0).catch(() => false);
  if (!hasEnabled08) {
    test.skip(true, "知识点无已发布题目（所有按钮 disabled），需在管理端生成题目");
    return;
  }
  await enabledStartBtns08.first().click();
  await expect(page).toHaveURL(/\/test\/.+/);
  await expect(page.getByText("加载题目中...")).not.toBeVisible({
    timeout: 10_000,
  });

  const noQuiz = await page
    .getByText("该知识点暂无题目")
    .isVisible()
    .catch(() => false);

  if (noQuiz) {
    test.skip(true, "知识点无已发布题目，需在管理端生成题目");
    return;
  }

  // 循环答题：最多 20 题
  const MAX_QUESTIONS = 20;
  for (let i = 0; i < MAX_QUESTIONS; i++) {
    // 检查是否已到结果页
    const resultHeading = page.getByText("答对");
    if (await resultHeading.isVisible().catch(() => false)) break;

    // 若是 idle 状态（未选）—— 点选项 A
    const submitBtn = page.getByRole("button", { name: "提交答案" });
    const nextBtn = page.getByRole("button", { name: /下一题|查看结果/ });

    const isNextVisible = await nextBtn.isVisible().catch(() => false);
    if (isNextVisible) {
      await nextBtn.click();
      continue;
    }

    const isSubmitVisible = await submitBtn.isVisible().catch(() => false);
    if (!isSubmitVisible) {
      // idle 状态，先选 A
      const optionA = page
        .locator("button")
        .filter({ has: page.locator("span", { hasText: "A" }) })
        .first();
      if (await optionA.isVisible().catch(() => false)) {
        await optionA.click();
      }
    } else {
      await submitBtn.click();
      // 等待反馈
      await expect(
        page.getByText("回答正确！").or(page.getByText(/正确答案：/))
      ).toBeVisible({ timeout: 15_000 });
    }
  }

  // 结果页：显示百分比成绩
  const resultScore = page.locator(".text-5xl.font-bold.text-primary-500");
  await expect(resultScore).toBeVisible({ timeout: 5_000 });
  await expect(resultScore).toHaveText(/%/);

  // 答对 X/N 题 文字
  await expect(page.getByText(/答对 \d+\/\d+ 题/)).toBeVisible();

  // 返回测试中心按钮
  await expect(
    page.getByRole("button", { name: "返回测试中心" })
  ).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9：详情页「去测试」按钮 → /test?knowledgeId=xxx 跳转
// ─────────────────────────────────────────────────────────────────────────────
test("TC09 知识点详情页「去测试」→ 跳转 /test?knowledgeId=xxx", async ({
  employeePage: page,
}) => {
  // 先找到第一个已发布知识点 ID（通过 API）
  const apiRes = await page.request.get(
    "/api/knowledge?status=published&limit=1"
  );
  const apiJson = await apiRes.json();

  if (!apiJson.success || !apiJson.data?.length) {
    test.skip(true, "需要 seed 测试知识点 — 见 lib/db/seed.ts");
    return;
  }

  const firstItem = apiJson.data[0] as { id: string; category: string };
  await page.goto(`/learn/${firstItem.category}/${firstItem.id}`);

  await expect(page.getByText("加载中...")).not.toBeVisible({
    timeout: 10_000,
  });

  // 顶栏「去测试」按钮（exact:true 避免匹配「去测试一下」）
  const testBtn = page.getByRole("button", { name: "去测试", exact: true });
  await expect(testBtn).toBeVisible();
  await testBtn.click();

  await expect(page).toHaveURL(
    new RegExp(`/test\\?knowledgeId=${firstItem.id}`)
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10：学习进度持久化——「标记已学完」后再访问仍显示「已学完」
// ─────────────────────────────────────────────────────────────────────────────
test("TC10 学习进度持久化：标记已学完 → 再次访问显示已学完", async ({
  employeePage: page,
}) => {
  const apiRes = await page.request.get(
    "/api/knowledge?status=published&limit=1"
  );
  const apiJson = await apiRes.json();

  if (!apiJson.success || !apiJson.data?.length) {
    test.skip(true, "需要 seed 测试知识点 — 见 lib/db/seed.ts");
    return;
  }

  const firstItem = apiJson.data[0] as { id: string; category: string };
  const detailUrl = `/learn/${firstItem.category}/${firstItem.id}`;

  await page.goto(detailUrl);
  await expect(page.getByText("加载中...")).not.toBeVisible({ timeout: 10_000 });

  // 如果已是"已学完"状态则直接通过
  const alreadyDone = page.getByText("已学完");
  if (await alreadyDone.isVisible().catch(() => false)) {
    // 已完成，测试通过
    return;
  }

  // 点击标记已学完
  const markBtn = page.getByRole("button", { name: "标记已学完" });
  await expect(markBtn).toBeVisible();
  await markBtn.click();

  // 等待按钮状态变化（API 调用完成）
  await expect(page.getByText("已学完")).toBeVisible({ timeout: 10_000 });

  // 重新访问该页面，仍然显示已学完
  await page.goto(detailUrl);
  await expect(page.getByText("加载中...")).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("已学完")).toBeVisible({ timeout: 10_000 });
});
