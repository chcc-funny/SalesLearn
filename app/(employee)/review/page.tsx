"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

type Tab = "pending" | "resolved";

interface ReviewItem {
  id: string;
  questionId: string | null;
  knowledgeId: string | null;
  knowledgeTitle: string | null;
  questionText: string | null;
  questionType: string | null;
  options: Record<string, string> | null;
  correctAnswer: string | null;
  explanations: Record<string, string> | null;
  nextReviewAt: string | null;
  reviewCount: number | null;
  correctStreak: number | null;
  isResolved: boolean | null;
  createdAt: string | null;
}

interface ReviewData {
  items: ReviewItem[];
  total: number;
  dueCount: number;
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
  memory: "记忆",
  understanding: "理解",
  application: "应用",
  analysis: "分析",
};

function formatReviewDate(dateStr: string | null): string {
  if (!dateStr) return "未设定";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / 3600000);

  if (diffMs <= 0) return "现在可复习";
  if (diffHours < 1) return "即将到期";
  if (diffHours < 24) return `${diffHours} 小时后`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} 天后`;
}

function formatCreatedDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function ReviewPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [data, setData] = useState<ReviewData>({
    items: [],
    total: 0,
    dueCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchReviewList = useCallback(async (tab: Tab) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/review/list?tab=${tab}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch {
      // 静默处理
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviewList(activeTab);
  }, [activeTab, fetchReviewList]);

  const handleTabChange = (tab: Tab) => {
    if (tab !== activeTab) {
      setActiveTab(tab);
    }
  };

  const isDue = (item: ReviewItem): boolean => {
    if (!item.nextReviewAt) return false;
    return new Date(item.nextReviewAt) <= new Date();
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-lg">
          {/* 页面标题 */}
          <h1 className="mb-1 text-xl font-semibold text-text-primary">
            错题本
          </h1>
          <p className="mb-4 text-sm text-text-secondary">
            间隔复习，连对 3 次即掌握
          </p>

          {/* Tab 切换 */}
          <div className="mb-4 flex rounded-lg bg-surface-muted p-1">
            <button
              onClick={() => handleTabChange("pending")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                activeTab === "pending"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              待复习
              {activeTab === "pending" && data.dueCount > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error-500 px-1 text-xs text-white">
                  {data.dueCount}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange("resolved")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                activeTab === "resolved"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              已掌握
            </button>
          </div>

          {/* 列表内容 */}
          {isLoading ? (
            <p className="py-12 text-center text-text-tertiary">加载中...</p>
          ) : data.items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-text-secondary">
                {activeTab === "pending"
                  ? "暂无待复习题目，继续加油！"
                  : "暂无已掌握题目"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.items.map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  tab={activeTab}
                  isDue={isDue(item)}
                  onReview={() =>
                    router.push(
                      `/review/${item.id}`
                    )
                  }
                />
              ))}
            </div>
          )}

          {/* 底部统计 */}
          {!isLoading && data.total > 0 && (
            <p className="mt-4 text-center text-xs text-text-tertiary">
              共 {data.total} 题
              {activeTab === "pending" && data.dueCount > 0 && (
                <span>，其中 {data.dueCount} 题待复习</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* 底部 Tab */}
      <nav className="border-t bg-surface px-4 pb-safe">
        <div className="mx-auto flex max-w-lg">
          {[
            { key: "learn", label: "学习", icon: "📚", path: "/learn" },
            { key: "test", label: "测试", icon: "📝", path: "/test" },
            { key: "review", label: "错题", icon: "🔄", path: "/review" },
            { key: "feynman", label: "讲解", icon: "🎤", path: "/feynman" },
          ].map((tab) => {
            const isActive = tab.key === "review";
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

/** 单个错题卡片 */
function ReviewCard({
  item,
  tab,
  isDue,
  onReview,
}: {
  item: ReviewItem;
  tab: Tab;
  isDue: boolean;
  onReview: () => void;
}) {
  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isDue && tab === "pending"
          ? "border-warning-300 bg-warning-50"
          : "bg-surface"
      }`}
    >
      {/* 知识点标题 + 题型 */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-text-tertiary">
          {item.knowledgeTitle ?? "未知知识点"}
        </span>
        {item.questionType && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {QUESTION_TYPE_LABELS[item.questionType] ?? item.questionType}
          </Badge>
        )}
      </div>

      {/* 题目内容（截断） */}
      <p className="mb-3 text-sm text-text-primary line-clamp-2">
        {item.questionText ?? "题目内容不可用"}
      </p>

      {/* 底部信息 + 操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          {tab === "pending" ? (
            <>
              <span>
                连对 {item.correctStreak ?? 0}/3
              </span>
              <span className={isDue ? "text-warning-600 font-medium" : ""}>
                {formatReviewDate(item.nextReviewAt)}
              </span>
            </>
          ) : (
            <>
              <span>复习 {item.reviewCount ?? 0} 次</span>
              <span>加入于 {formatCreatedDate(item.createdAt)}</span>
            </>
          )}
        </div>

        {tab === "pending" && (
          <button
            onClick={onReview}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isDue
                ? "bg-primary-500 text-white hover:bg-primary-600"
                : "bg-primary-50 text-primary-500 hover:bg-primary-100"
            }`}
          >
            {isDue ? "立即复习" : "复习"}
          </button>
        )}
      </div>
    </div>
  );
}
