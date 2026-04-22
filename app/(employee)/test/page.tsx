"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  product: "产品知识",
  objection: "客户异议",
  closing: "成交话术",
  psychology: "客户心理",
};

const CATEGORY_ORDER = ["product", "objection", "closing", "psychology"];

export default function TestEntryPage() {
  const router = useRouter();
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeItem[]>([]);
  const [quizCounts, setQuizCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // 获取已发布知识点
        const kbRes = await fetch("/api/knowledge?status=published&limit=50");
        const kbJson = await kbRes.json();
        if (!kbJson.success) return;

        const items: KnowledgeItem[] = kbJson.data;
        setKnowledgeList(items);

        // 获取各知识点的已发布题目数
        const counts: Record<string, number> = {};
        await Promise.all(
          items.map(async (item) => {
            const res = await fetch(
              `/api/quiz/by-knowledge/${item.id}`
            );
            const json = await res.json();
            if (json.success) {
              counts[item.id] = json.data.total;
            }
          })
        );
        setQuizCounts(counts);
      } catch {
        // 静默处理
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // 按分类分组
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
            测试中心
          </h1>
          <p className="mb-6 text-sm text-text-secondary">
            选择知识点开始测试
          </p>

          {isLoading ? (
            <p className="py-12 text-center text-text-tertiary">加载中...</p>
          ) : grouped.length === 0 ? (
            <p className="py-12 text-center text-text-secondary">
              暂无可测试的知识点
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
                      const count = quizCounts[item.id] ?? 0;
                      const hasQuiz = count > 0;

                      return (
                        <button
                          key={item.id}
                          onClick={() =>
                            hasQuiz &&
                            router.push(`/test/${item.id}`)
                          }
                          disabled={!hasQuiz}
                          className={`flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors ${
                            hasQuiz
                              ? "bg-surface hover:bg-primary-50 hover:border-primary-300"
                              : "bg-surface-muted opacity-60 cursor-not-allowed"
                          }`}
                        >
                          <div>
                            <p className="text-sm font-medium text-text-primary">
                              {item.title}
                            </p>
                            <p className="mt-0.5 text-xs text-text-tertiary">
                              {hasQuiz
                                ? `${count} 道题目`
                                : "暂无题目"}
                            </p>
                          </div>
                          {hasQuiz ? (
                            <Badge
                              variant="outline"
                              className="text-primary-500 border-primary-300"
                            >
                              开始测试
                            </Badge>
                          ) : (
                            <Badge variant="secondary">未出题</Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部 Tab */}
      <nav className="border-t bg-surface px-4 pb-safe">
        <div className="mx-auto flex max-w-lg">
          {[
            { key: "learn", label: "学习", icon: "📚", path: "/learn" },
            { key: "test", label: "测试", icon: "📝", path: "/test" },
            { key: "feynman", label: "讲解", icon: "🎤", path: "/feynman" },
            { key: "dashboard", label: "我的", icon: "👤", path: "/dashboard" },
          ].map((tab) => {
            const isActive = tab.key === "test";
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
