import { type NextRequest } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { userLearningProgress, knowledgeBase } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";

/**
 * GET /api/learning/progress?category=product
 * 获取当前用户的学习进度统计
 */
export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  try {
    // 构建知识点条件
    const kbConditions = [
      eq(knowledgeBase.tenantId, user.tenantId),
      eq(knowledgeBase.status, "published"),
    ];
    if (category) {
      kbConditions.push(eq(knowledgeBase.category, category));
    }
    const kbWhere = and(...kbConditions);

    // 并行查询：总知识点数 + 用户已完成数 + 用户进行中数
    const [totalResult, progressResult] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeBase)
        .where(kbWhere),
      db
        .select({
          completed: sql<number>`count(*) filter (where ${userLearningProgress.isCompleted} = true)::int`,
          inProgress: sql<number>`count(*) filter (where ${userLearningProgress.isCompleted} = false)::int`,
        })
        .from(userLearningProgress)
        .innerJoin(
          knowledgeBase,
          and(
            eq(userLearningProgress.knowledgeId, knowledgeBase.id),
            kbWhere
          )
        )
        .where(eq(userLearningProgress.userId, user.id)),
    ]);

    const total = totalResult[0]?.count ?? 0;
    const completed = progressResult[0]?.completed ?? 0;
    const inProgress = progressResult[0]?.inProgress ?? 0;
    const notStarted = Math.max(0, total - completed - inProgress);
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return successResponse({
      total,
      completed,
      inProgress,
      notStarted,
      percentage,
    });
  } catch {
    return errorResponse("获取学习进度失败", ErrorCode.DATABASE_ERROR);
  }
});

const progressSchema = z.object({
  knowledgeId: z.string().uuid("无效的知识点 ID"),
  viewDuration: z.number().int().min(0).optional(),
  scrollDepth: z.number().min(0).max(1).optional(),
  isFavorited: z.boolean().optional(),
  /** 手动标记完成 */
  markCompleted: z.boolean().optional(),
});

/** 自动完成判定：停留 >= 30秒 且 滑动深度 >= 0.8 */
const AUTO_COMPLETE_DURATION = 30;
const AUTO_COMPLETE_SCROLL = 0.8;

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json();
    const parsed = progressSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    const { knowledgeId, viewDuration, scrollDepth, isFavorited, markCompleted } =
      parsed.data;

    // 查找现有记录
    const [existing] = await db
      .select()
      .from(userLearningProgress)
      .where(
        and(
          eq(userLearningProgress.userId, user.id),
          eq(userLearningProgress.knowledgeId, knowledgeId)
        )
      )
      .limit(1);

    if (existing) {
      // 更新：累加停留时长，取最大滑动深度
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (viewDuration !== undefined) {
        updates.viewDuration = (existing.viewDuration ?? 0) + viewDuration;
      }

      if (scrollDepth !== undefined) {
        updates.scrollDepth = Math.max(existing.scrollDepth ?? 0, scrollDepth);
      }

      if (isFavorited !== undefined) {
        updates.isFavorited = isFavorited;
      }

      // 手动标记完成
      if (markCompleted && !existing.isCompleted) {
        updates.isCompleted = true;
        updates.completedAt = new Date();
      }

      // 自动完成判定
      const newDuration = (updates.viewDuration as number) ?? existing.viewDuration ?? 0;
      const newScroll = (updates.scrollDepth as number) ?? existing.scrollDepth ?? 0;
      if (
        !existing.isCompleted &&
        !updates.isCompleted &&
        newDuration >= AUTO_COMPLETE_DURATION &&
        newScroll >= AUTO_COMPLETE_SCROLL
      ) {
        updates.isCompleted = true;
        updates.completedAt = new Date();
      }

      const [updated] = await db
        .update(userLearningProgress)
        .set(updates)
        .where(eq(userLearningProgress.id, existing.id))
        .returning();

      return successResponse(updated);
    }

    // 新建记录
    const [created] = await db
      .insert(userLearningProgress)
      .values({
        userId: user.id,
        knowledgeId,
        viewDuration: viewDuration ?? 0,
        scrollDepth: scrollDepth ?? 0,
        isFavorited: isFavorited ?? false,
      })
      .returning();

    return successResponse(created);
  } catch {
    return errorResponse("记录学习进度失败", ErrorCode.DATABASE_ERROR);
  }
});
