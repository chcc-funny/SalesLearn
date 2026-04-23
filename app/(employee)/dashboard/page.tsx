"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// ---------- 类型定义 ----------

interface CategoryProgress {
  total: number;
  completed: number;
  inProgress: number;
  percentage: number;
}

interface FeynmanRecord {
  id: string;
  knowledgeId: string;
  knowledgeTitle: string | null;
  stage: string;
  totalScore: number | null;
  isPassed: boolean | null;
  createdAt: string;
}

interface DashboardData {
  learning: Record<string, CategoryProgress>;
  feynmanRecords: FeynmanRecord[];
  isLoading: boolean;
}

// ---------- 常量 ----------

const CATEGORIES = [
  { key: "product", label: "产品知识", icon: "📦" },
  { key: "objection", label: "客户异议", icon: "💬" },
  { key: "closing", label: "成交话术", icon: "🤝" },
  { key: "psychology", label: "客户心理", icon: "🧠" },
] as const;

const TAB_ITEMS = [
  { key: "learn", label: "学习", icon: "📚", path: "/learn" },
  { key: "test", label: "测试", icon: "📝", path: "/test" },
  { key: "feynman", label: "讲解", icon: "🎤", path: "/feynman" },
  { key: "dashboard", label: "我的", icon: "👤", path: "/dashboard" },
] as const;

// 雷达图 SVG 参数
const RADAR_SIZE = 240;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 90;
const RADAR_LEVELS = 4;

// ---------- 工具函数 ----------

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleIndex: number,
  total: number
): { x: number; y: number } {
  const angle = (Math.PI * 2 * angleIndex) / total - Math.PI / 2;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function buildPolygonPoints(
  values: number[],
  cx: number,
  cy: number,
  maxR: number
): string {
  return values
    .map((v, i) => {
      const r = (v / 100) * maxR;
      const pt = polarToCartesian(cx, cy, r, i, values.length);
      return `${pt.x},${pt.y}`;
    })
    .join(" ");
}

// ---------- 雷达图组件 ----------

function RadarChart({
  scores,
}: {
  scores: { label: string; value: number }[];
}) {
  const total = scores.length;

  // 背景网格
  const gridLevels = Array.from({ length: RADAR_LEVELS }, (_, i) => {
    const r = (RADAR_RADIUS / RADAR_LEVELS) * (i + 1);
    const points = Array.from({ length: total }, (_, j) => {
      const pt = polarToCartesian(RADAR_CENTER, RADAR_CENTER, r, j, total);
      return `${pt.x},${pt.y}`;
    }).join(" ");
    return { r, points };
  });

  // 轴线
  const axes = scores.map((_, i) => {
    const pt = polarToCartesian(
      RADAR_CENTER,
      RADAR_CENTER,
      RADAR_RADIUS,
      i,
      total
    );
    return pt;
  });

  // 数据多边形
  const dataPoints = buildPolygonPoints(
    scores.map((s) => s.value),
    RADAR_CENTER,
    RADAR_CENTER,
    RADAR_RADIUS
  );

  // 标签位置（稍微外移）
  const labels = scores.map((s, i) => {
    const pt = polarToCartesian(
      RADAR_CENTER,
      RADAR_CENTER,
      RADAR_RADIUS + 28,
      i,
      total
    );
    return { ...pt, label: s.label, value: s.value };
  });

  return (
    <svg
      viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
      className="mx-auto w-full max-w-[240px]"
    >
      {/* 背景网格 */}
      {gridLevels.map((level, i) => (
        <polygon
          key={i}
          points={level.points}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth={0.5}
        />
      ))}

      {/* 轴线 */}
      {axes.map((pt, i) => (
        <line
          key={i}
          x1={RADAR_CENTER}
          y1={RADAR_CENTER}
          x2={pt.x}
          y2={pt.y}
          stroke="currentColor"
          className="text-border"
          strokeWidth={0.5}
        />
      ))}

      {/* 数据区域 */}
      <polygon
        points={dataPoints}
        className="fill-primary-500/20 stroke-primary-500"
        strokeWidth={2}
      />

      {/* 数据点 */}
      {scores.map((s, i) => {
        const r = (s.value / 100) * RADAR_RADIUS;
        const pt = polarToCartesian(RADAR_CENTER, RADAR_CENTER, r, i, total);
        return (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={3.5}
            className="fill-primary-500"
          />
        );
      })}

      {/* 标签 */}
      {labels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-text-secondary text-[11px]"
        >
          {l.label}
        </text>
      ))}
    </svg>
  );
}

// ---------- 数据获取 Hook ----------

function useDashboardData(): DashboardData {
  const [learning, setLearning] = useState<Record<string, CategoryProgress>>(
    {}
  );
  const [feynmanRecords, setFeynmanRecords] = useState<FeynmanRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [learningResults, feynmanRes] = await Promise.all([
          // 并行获取 4 个分类的学习进度
          Promise.all(
            CATEGORIES.map(async (cat) => {
              const res = await fetch(
                `/api/learning/progress?category=${cat.key}`
              );
              const json = await res.json();
              return {
                category: cat.key,
                data: json.success
                  ? (json.data as CategoryProgress)
                  : { total: 0, completed: 0, inProgress: 0, percentage: 0 },
              };
            })
          ),
          // 获取费曼讲解记录
          fetch("/api/feynman/records").then((r) => r.json()),
        ]);

        // 学习进度
        const map: Record<string, CategoryProgress> = {};
        learningResults.forEach((r) => {
          map[r.category] = r.data;
        });
        setLearning(map);

        // 费曼记录
        if (feynmanRes.success && feynmanRes.data?.records) {
          setFeynmanRecords(feynmanRes.data.records);
        }
      } catch {
        // 静默处理
      } finally {
        setIsLoading(false);
      }
    }
    fetchAll();
  }, []);

  return { learning, feynmanRecords, isLoading };
}

// ---------- 主页面 ----------

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { learning, feynmanRecords, isLoading } = useDashboardData();

  // 计算各维度分数（0-100）
  const categoryScores = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const p = learning[cat.key];
      return {
        key: cat.key,
        label: cat.label,
        icon: cat.icon,
        // 学习完成度作为基础分数
        value: p ? p.percentage : 0,
      };
    });
  }, [learning]);

  // 综合评分
  const overallScore = useMemo(() => {
    const scores = categoryScores.map((s) => s.value);
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [categoryScores]);

  // 薄弱环节：得分最低的 1-2 个分类
  const weakPoints = useMemo(() => {
    const sorted = [...categoryScores].sort((a, b) => a.value - b.value);
    // 取得分最低的，且分数 < 80 的
    return sorted.filter((s) => s.value < 80).slice(0, 2);
  }, [categoryScores]);

  // 学习数据汇总
  const learningSummary = useMemo(() => {
    let totalCards = 0;
    let completedCards = 0;
    CATEGORIES.forEach((cat) => {
      const p = learning[cat.key];
      if (p) {
        totalCards += p.total;
        completedCards += p.completed;
      }
    });
    const completionRate =
      totalCards > 0 ? Math.round((completedCards / totalCards) * 100) : 0;

    // 费曼讲解统计
    const feynmanCount = feynmanRecords.length;
    const passedFeynman = feynmanRecords.filter((r) => r.isPassed).length;
    const avgFeynmanScore =
      feynmanRecords.length > 0
        ? Math.round(
            feynmanRecords.reduce((sum, r) => sum + (r.totalScore ?? 0), 0) /
              feynmanRecords.length
          )
        : 0;

    return {
      totalCards,
      completedCards,
      completionRate,
      feynmanCount,
      passedFeynman,
      avgFeynmanScore,
    };
  }, [learning, feynmanRecords]);

  // 评分等级
  const scoreLevel = useMemo(() => {
    if (overallScore >= 90) return { label: "优秀", color: "text-success" };
    if (overallScore >= 70) return { label: "良好", color: "text-primary-500" };
    if (overallScore >= 50) return { label: "一般", color: "text-warning" };
    return { label: "需加油", color: "text-error" };
  }, [overallScore]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 顶部用户信息 + 综合评分 */}
      <div className="bg-primary-500 px-4 pb-8 pt-6 text-white">
        <div className="mx-auto max-w-lg">
          <h1 className="text-lg font-semibold">个人看板</h1>
          <p className="mt-0.5 text-sm text-white/80">
            {session?.user?.name ?? "同学"}，继续加油！
          </p>

          <div className="mt-4 flex items-end gap-2">
            <span className="text-5xl font-bold leading-none">
              {isLoading ? "--" : overallScore}
            </span>
            <div className="mb-1 flex flex-col">
              <span className="text-xs text-white/70">综合评分</span>
              {!isLoading && (
                <span className="text-sm font-medium">
                  {scoreLevel.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 主体内容 */}
      <div className="flex-1 px-4 pb-4">
        <div className="mx-auto max-w-lg -mt-4 space-y-4">
          {/* 能力雷达图 */}
          <div className="rounded-xl bg-surface p-4 shadow-card">
            <h2 className="mb-3 text-sm font-medium text-text-primary">
              能力雷达图
            </h2>
            {isLoading ? (
              <div className="flex h-[240px] items-center justify-center">
                <span className="text-sm text-text-tertiary">加载中...</span>
              </div>
            ) : (
              <RadarChart
                scores={categoryScores.map((s) => ({
                  label: s.label,
                  value: s.value,
                }))}
              />
            )}
          </div>

          {/* 薄弱环节提示 */}
          {!isLoading && weakPoints.length > 0 && (
            <div className="rounded-xl bg-warning-bg p-4 shadow-card">
              <h2 className="mb-2 text-sm font-medium text-text-primary">
                ⚠️ 薄弱环节
              </h2>
              <div className="space-y-2">
                {weakPoints.map((wp) => (
                  <div
                    key={wp.key}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-text-secondary">
                      {wp.icon} {wp.label}
                    </span>
                    <span className="text-sm font-medium text-warning">
                      {wp.value}%
                    </span>
                  </div>
                ))}
                <p className="mt-1 text-xs text-text-tertiary">
                  建议优先学习以上分类，提升综合能力
                </p>
              </div>
            </div>
          )}

          {/* 学习数据概览 */}
          <div className="rounded-xl bg-surface p-4 shadow-card">
            <h2 className="mb-3 text-sm font-medium text-text-primary">
              学习数据
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {/* 卡片学习完成度 */}
              <div className="flex flex-col items-center rounded-lg bg-primary-50 p-3">
                <span className="text-2xl font-bold text-primary-600">
                  {isLoading ? "--" : `${learningSummary.completionRate}%`}
                </span>
                <span className="mt-1 text-[11px] text-text-tertiary">
                  学习完成度
                </span>
                {!isLoading && (
                  <span className="text-[10px] text-text-disabled">
                    {learningSummary.completedCards}/{learningSummary.totalCards}
                  </span>
                )}
              </div>

              {/* 费曼讲解次数 */}
              <div className="flex flex-col items-center rounded-lg bg-success-bg p-3">
                <span className="text-2xl font-bold text-success">
                  {isLoading ? "--" : learningSummary.feynmanCount}
                </span>
                <span className="mt-1 text-[11px] text-text-tertiary">
                  讲解次数
                </span>
                {!isLoading && learningSummary.feynmanCount > 0 && (
                  <span className="text-[10px] text-text-disabled">
                    {learningSummary.passedFeynman} 次通过
                  </span>
                )}
              </div>

              {/* 费曼平均分 */}
              <div className="flex flex-col items-center rounded-lg bg-info-bg p-3">
                <span className="text-2xl font-bold text-info">
                  {isLoading
                    ? "--"
                    : learningSummary.feynmanCount > 0
                      ? learningSummary.avgFeynmanScore
                      : "-"}
                </span>
                <span className="mt-1 text-[11px] text-text-tertiary">
                  讲解均分
                </span>
                {!isLoading && learningSummary.feynmanCount > 0 && (
                  <span className="text-[10px] text-text-disabled">
                    满分 100
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 各分类详细进度 */}
          <div className="rounded-xl bg-surface p-4 shadow-card">
            <h2 className="mb-3 text-sm font-medium text-text-primary">
              分类进度
            </h2>
            <div className="space-y-3">
              {categoryScores.map((cat) => (
                <div key={cat.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">
                      {cat.icon} {cat.label}
                    </span>
                    <span className="font-medium text-text-primary">
                      {isLoading ? "--" : `${cat.value}%`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border/30">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all duration-700"
                      style={{ width: isLoading ? "0%" : `${cat.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 底部 Tab 导航 */}
      <nav className="border-t bg-surface px-4 pb-safe">
        <div className="mx-auto flex max-w-lg">
          {TAB_ITEMS.map((tab) => {
            const isActive = tab.key === "dashboard";
            return (
              <button
                key={tab.key}
                onClick={() => router.push(tab.path)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                  isActive
                    ? "text-primary-500"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
