import { type NextRequest } from "next/server";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeBase } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { createKnowledgeSchema } from "@/lib/validations/knowledge";

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20")));
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  try {
    // 构建 where 条件
    const conditions = [eq(knowledgeBase.tenantId, user.tenantId)];

    if (status) {
      conditions.push(eq(knowledgeBase.status, status));
    }

    // 员工只能看到已发布的知识点
    if (user.role === "employee") {
      conditions.push(eq(knowledgeBase.status, "published"));
    }

    if (category) {
      conditions.push(eq(knowledgeBase.category, category));
    }

    const where = and(...conditions);
    const offset = (page - 1) * limit;

    // 并行查询数据和总数
    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(knowledgeBase)
        .where(where)
        .orderBy(desc(knowledgeBase.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeBase)
        .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;

    return paginatedResponse(items, total, page, limit);
  } catch {
    return errorResponse("获取知识点列表失败", ErrorCode.DATABASE_ERROR);
  }
});

export const POST = withAuth(
  async (req: NextRequest, { user }) => {
    try {
      const body = await req.json();
      const parsed = createKnowledgeSchema.safeParse(body);

      if (!parsed.success) {
        const message = parsed.error.issues
          .map((i) => i.message)
          .join("; ");
        return errorResponse(message, ErrorCode.VALIDATION_ERROR);
      }

      const { title, category, keyPoints, content, examples, commonMistakes, images } =
        parsed.data;

      const [created] = await db
        .insert(knowledgeBase)
        .values({
          tenantId: user.tenantId,
          title,
          category,
          keyPoints,
          content,
          examples: examples ?? null,
          commonMistakes: commonMistakes ?? null,
          images,
          status: "draft",
          createdBy: user.id,
        })
        .returning();

      return successResponse(created);
    } catch {
      return errorResponse("创建知识点失败", ErrorCode.DATABASE_ERROR);
    }
  },
  ["manager"]
);
