"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
}

interface FeynmanRecord {
  id: string;
  knowledgeId: string | null;
  knowledgeTitle: string | null;
  stage: string | null;
  totalScore: number | null;
  isPassed: boolean | null;
  createdAt: string | null;
}

/** Per-knowledge summary derived from records */
interface KnowledgeSummary {
  attempts: number;
  bestScore: number | null;
  isPassed: boolean;
  lastAttempt: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  product: "产品知识",
  objection: "客户异议",
  closing: "成交话术",
  psychology: "客户心理",
};

const CATEGORY_ORDER = ["product", "objection", "closing", "psychology"];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-text-tertiary";
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-error";
}

export default function FeynmanEntryPage() {
  const router = useRouter();
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeItem[]>([]);
  const [summaries, setSummaries] = useState<Record<string, KnowledgeSummary>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch published knowledge points
        const kbRes = await fetch("/api/knowledge?status=published&limit=50");
        const kbJson = await kbRes.json();
        if (!kbJson.success) return;
        setKnowledgeList(kbJson.data);

        // Fetch feynman records
        const recRes = await fetch("/api/feynman/records");
        const recJson = await recRes.json();
        if (recJson.success) {
          const records: FeynmanRecord[] = recJson.data.records;
          setSummaries(buildSummaries(records));
        }
      } catch {
        // 静默处理
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Group by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    items: knowledgeList.filter((k) => k.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-lg">
          <h1 className="mb-1 text-xl font-semibold text-text-primary">
            费曼讲解
          </h1>
          <p className="mb-6 text-sm text-text-secondary">
            用自己的话讲给 AI 听，检验你的掌握程度
          </p>

          {isLoading ? (
            <p className="py-12 text-center text-text-tertiary">加载中...</p>
          ) : grouped.length === 0 ? (
            <p className="py-12 text-center text-text-secondary">
              暂无可讲解的知识点
            </p>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.category}>
                  <h2 className="mb-2 text-sm font-medium text-text-secondary">
                    {group.label}
                  </h2>
                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const summary = summaries[item.id];
                      return (
                        <FeynmanKnowledgeCard
                          key={item.id}
                          item={item}
                          summary={summary}
                          onStart={() =>
                            router.push(`/feynman/${item.id}`)
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="border-t bg-surface px-4 pb-safe">
        <div className="mx-auto flex max-w-lg">
          {[
            { key: "learn", label: "学习", icon: "📚", path: "/learn" },
            { key: "test", label: "测试", icon: "📝", path: "/test" },
            { key: "review", label: "错题", icon: "🔄", path: "/review" },
            { key: "feynman", label: "讲解", icon: "🎤", path: "/feynman" },
          ].map((tab) => {
            const isActive = tab.key === "feynman";
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

/** Single knowledge card with feynman summary */
function FeynmanKnowledgeCard({
  item,
  summary,
  onStart,
}: {
  item: KnowledgeItem;
  summary?: KnowledgeSummary;
  onStart: () => void;
}) {
  const hasAttempts = summary && summary.attempts > 0;

  return (
    <button
      onClick={onStart}
      className="flex w-full items-center justify-between rounded-lg border bg-surface p-4 text-left transition-colors hover:bg-primary-50 hover:border-primary-300"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {item.title}
        </p>
        {hasAttempts ? (
          <div className="mt-1 flex items-center gap-3 text-xs">
            <span className={scoreColor(summary.bestScore)}>
              最高 {summary.bestScore ?? 0} 分
            </span>
            <span className="text-text-tertiary">
              {summary.attempts} 次讲解
            </span>
            {summary.lastAttempt && (
              <span className="text-text-tertiary">
                {formatDate(summary.lastAttempt)}
              </span>
            )}
          </div>
        ) : (
          <p className="mt-1 text-xs text-text-tertiary">尚未讲解</p>
        )}
      </div>

      <div className="ml-3 shrink-0">
        {summary?.isPassed ? (
          <Badge className="bg-success text-white border-transparent">
            已通过
          </Badge>
        ) : hasAttempts ? (
          <Badge
            variant="outline"
            className="text-primary-500 border-primary-300"
          >
            再试一次
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-primary-500 border-primary-300"
          >
            开始讲解
          </Badge>
        )}
      </div>
    </button>
  );
}

/** Build per-knowledge summaries from flat record list */
function buildSummaries(
  records: FeynmanRecord[]
): Record<string, KnowledgeSummary> {
  const map: Record<string, KnowledgeSummary> = {};

  for (const r of records) {
    if (!r.knowledgeId) continue;

    const existing = map[r.knowledgeId];
    if (!existing) {
      map[r.knowledgeId] = {
        attempts: 1,
        bestScore: r.totalScore,
        isPassed: r.isPassed ?? false,
        lastAttempt: r.createdAt,
      };
    } else {
      map[r.knowledgeId] = {
        attempts: existing.attempts + 1,
        bestScore:
          r.totalScore !== null &&
          (existing.bestScore === null || r.totalScore > existing.bestScore)
            ? r.totalScore
            : existing.bestScore,
        isPassed: existing.isPassed || (r.isPassed ?? false),
        lastAttempt: existing.lastAttempt, // Already sorted desc, first is latest
      };
    }
  }

  return map;
}
