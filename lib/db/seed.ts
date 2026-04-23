/**
 * 种子数据脚本
 *
 * 使用方式: npx tsx lib/db/seed.ts
 * 前提: DATABASE_URL 环境变量已配置
 *
 * 测试账号:
 *   主管: manager@saleslearn.com / admin123
 *   员工1: employee1@saleslearn.com / test123
 *   员工2: employee2@saleslearn.com / test123
 *
 * 支持重复执行（upsert 模式，已存在则跳过）
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { users } from "./schema/users";
import { knowledgeBase } from "./schema/knowledge-base";
import { questions } from "./schema/questions";

// 默认租户 ID
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

// bcrypt hashes (verified)
const HASH_ADMIN123 =
  "$2b$10$VnIWKk8MmTV3zJTiDiOhzeBMf6MjOMD4O2vBgEbmUvYiAy2ycRjo6";
const HASH_TEST123 =
  "$2b$10$FRwEDxyLMf7DMwQQOL9FJeDqspCVlSpUJfzpZNWd9iv6qsO7.M/1m";

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL 环境变量未配置");
    process.exit(1);
  }

  const sql = neon(databaseUrl);
  const db = drizzle(sql);

  console.log("开始插入种子数据...");

  // 检查是否已有数据（幂等）
  const existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.email, "manager@saleslearn.com"))
    .limit(1);

  if (existingUsers.length > 0) {
    console.log("⚠️ 种子数据已存在，跳过插入。如需重新插入请先清空数据库。");
    return;
  }

  // 1. 创建用户
  const [manager] = await db
    .insert(users)
    .values({
      tenantId: TENANT_ID,
      name: "张主管",
      phone: "13800000001",
      email: "manager@saleslearn.com",
      // 密码: admin123
      passwordHash: HASH_ADMIN123,
      role: "manager",
    })
    .returning();

  const [employee1] = await db
    .insert(users)
    .values({
      tenantId: TENANT_ID,
      name: "李销售",
      phone: "13800000002",
      email: "employee1@saleslearn.com",
      // 密码: test123
      passwordHash: HASH_TEST123,
      role: "employee",
    })
    .returning();

  const [employee2] = await db
    .insert(users)
    .values({
      tenantId: TENANT_ID,
      name: "王销售",
      phone: "13800000003",
      email: "employee2@saleslearn.com",
      // 密码: test123
      passwordHash: HASH_TEST123,
      role: "employee",
    })
    .returning();

  console.log(`✓ 已创建 3 个用户: ${manager.name}, ${employee1.name}, ${employee2.name}`);

  // 2. 创建知识点
  const [kb1] = await db
    .insert(knowledgeBase)
    .values({
      tenantId: TENANT_ID,
      title: "汽车漆面保护膜（PPF）产品知识",
      category: "product",
      keyPoints: [
        "TPU 材质特性：自修复、抗黄变、耐腐蚀",
        "三层结构：涂层、基材、胶层",
        "使用寿命：优质 PPF 5-10 年",
        "保护范围：划痕、石子、鸟粪、树胶",
      ],
      content:
        "汽车漆面保护膜（PPF）是一种透明的聚氨酯薄膜，用于保护车辆的原漆免受日常磨损。优质 PPF 采用 TPU 材质，具有自修复功能——轻微划痕在受热后可自动恢复。",
      examples:
        "客户问：贴了膜还会被石子打伤吗？\n回答：PPF 的 TPU 基材具有极强的抗冲击性，正常行驶中的石子弹击不会伤及原漆，膜本身受到冲击后可通过热水或阳光自修复。",
      commonMistakes:
        "误区1：PPF 可以永久保护（实际有使用寿命）\n误区2：所有 PPF 都一样（不同品牌材质差异大）",
      status: "published",
      createdBy: manager.id,
    })
    .returning();

  const [kb2] = await db
    .insert(knowledgeBase)
    .values({
      tenantId: TENANT_ID,
      title: "客户价格异议处理话术",
      category: "objection",
      keyPoints: [
        "先认同再转化：理解客户价格敏感",
        "价值对比法：算日均成本",
        "风险对比法：不贴膜的维修费用",
        "分期方案：降低决策门槛",
      ],
      content:
        '当客户提出"太贵了"时，不要直接降价或辩解。先表达理解，再用价值框架重新定义价格。核心思路：将总价拆解为日均成本，与客户日常消费对比。',
      examples:
        '客户说：一万多太贵了吧？\n回答：我完全理解您的想法。这款膜质保5年，算下来每天不到6块钱，比一杯咖啡还便宜，但它24小时保护您爱车的原漆。很多客户一开始也觉得贵，用了之后都说值。',
      commonMistakes:
        "误区1：客户说贵就立刻打折（损害品牌价值）\n误区2：与竞品直接比价（容易陷入价格战）",
      status: "published",
      createdBy: manager.id,
    })
    .returning();

  console.log(`✓ 已创建 2 个知识点: ${kb1.title}, ${kb2.title}`);

  // 3. 创建示例题目
  await db.insert(questions).values([
    {
      tenantId: TENANT_ID,
      knowledgeId: kb1.id,
      type: "memory",
      questionText: "PPF 的主要材质是什么？",
      options: ["PVC", "TPU", "PE", "PP"],
      correctAnswer: "B",
      explanations: {
        A: "PVC 是较早期的材质，硬度高但不具备自修复功能",
        B: "正确！TPU（热塑性聚氨酯）是优质 PPF 的主要材质，具有自修复特性",
        C: "PE 是普通塑料，不适合用作漆面保护膜",
        D: "PP 主要用于包装材料，不具备 PPF 所需的柔韧性",
      },
      status: "published",
    },
    {
      tenantId: TENANT_ID,
      knowledgeId: kb1.id,
      type: "understanding",
      questionText: "PPF 的自修复功能原理是什么？",
      options: [
        "化学反应修复",
        "TPU 材质受热后分子链重新排列",
        "涂层自动填充划痕",
        "静电吸附修复",
      ],
      correctAnswer: "B",
      explanations: {
        A: "PPF 的自修复不依赖化学反应",
        B: "正确！TPU 分子链在受热后会重新排列，使轻微形变恢复原状",
        C: "涂层有一定保护作用，但自修复主要靠 TPU 基材",
        D: "静电与自修复无关",
      },
      status: "published",
    },
    {
      tenantId: TENANT_ID,
      knowledgeId: kb2.id,
      type: "application",
      questionText:
        "客户说「一万多太贵了」，以下哪种回应最合适？",
      options: [
        "我们可以打八折给您",
        "我理解您的想法，算下来每天不到6块钱，比一杯咖啡还便宜",
        "别家更贵，我们已经是最便宜的了",
        "那您看看我们的低端产品吧",
      ],
      correctAnswer: "B",
      explanations: {
        A: "直接打折会损害品牌价值，且客户可能继续压价",
        B: "正确！先认同再用日均成本法重新框架，让客户重新评估价值",
        C: "与竞品比价容易陷入价格战，也暴露了对竞品的关注",
        D: "推荐低端产品会让客户觉得原来的产品不值这个价",
      },
      status: "published",
    },
  ]);

  console.log("✓ 已创建 3 道示例题目");
  console.log("种子数据插入完成！");
}

seed().catch((err) => {
  console.error("种子数据插入失败:", err);
  process.exit(1);
});
