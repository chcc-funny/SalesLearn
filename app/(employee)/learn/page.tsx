"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface CategoryProgress {
  total: number;
  completed: number;
  inProgress: number;
  percentage: number;
}

const CATEGORIES = [
  {
    key: "product",
    title: "产品知识",
    desc: "膜类产品参数、卖点、施工工艺",
    color: "bg-primary-50",
    iconColor: "text-primary-500",
    icon: "📦",
  },
  {
    key: "objection",
    title: "客户异议",
    desc: "价格异议、竞品对比、犹豫处理",
    color: "bg-warning-bg",
    iconColor: "text-warning",
    icon: "💬",
  },
  {
    key: "closing",
    title: "成交话术",
    desc: "促单技巧、限时策略、附加推荐",
    color: "bg-success-bg",
    iconColor: "text-success",
    icon: "🤝",
  },
  {
    key: "psychology",
    title: "客户心理",
    desc: "购买动机、决策模型、信任建立",
    color: "bg-info-bg",
    iconColor: "text-info",
    icon: "🧠",
  },
];

const TAB_ITEMS = [
  { key: "learn", label: "学习", icon: "📚", path: "/learn" },
  { key: "test", label: "测试", icon: "📝", path: "/test" },
  { key: "feynman", label: "讲解", icon: "🎤", path: "/feynman" },
  { key: "dashboard", label: "我的", icon: "👤", path: "/dashboard" },
];

export default function LearnPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [progress, setProgress] = useState<Record<string, CategoryProgress>>({});

  useEffect(() => {
    async function fetchProgress() {
      try {
        const results = await Promise.all(
          CATEGORIES.map(async (cat) => {
            const res = await fetch(`/api/learning/progress?category=${cat.key}`);
            const json = await res.json();
            return {
              category: cat.key,
              data: json.success
                ? (json.data as CategoryProgress)
                : { total: 0, completed: 0, inProgress: 0, percentage: 0 },
            };
          })
        );
        const map: Record<string, CategoryProgress> = {};
        results.forEach((r) => {
          map[r.category] = r.data;
        });
        setProgress(map);
      } catch {
        // 静默处理
      }
    }
    fetchProgress();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 顶部区域 */}
      <div className="px-4 pb-4 pt-6">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-text-primary">
                学习中心
              </h1>
              <p className="text-sm text-text-secondary">
                欢迎回来，{session?.user?.name ?? "同学"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-text-tertiary"
            >
              退出
            </Button>
          </div>
        </div>
      </div>

      {/* 分类卡片网格 */}
      <div className="flex-1 px-4">
        <div className="mx-auto max-w-lg">
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => {
              const p = progress[cat.key];
              return (
                <button
                  key={cat.key}
                  onClick={() => router.push(`/learn/${cat.key}`)}
                  className={`${cat.color} flex flex-col rounded-xl p-5 text-left shadow-card transition-shadow hover:shadow-card-hover`}
                >
                  <span className="text-2xl">{cat.icon}</span>
                  <h3 className="mt-2 text-base font-medium text-text-primary">
                    {cat.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-text-tertiary">{cat.desc}</p>

                  {p ? (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary">
                          {p.completed}/{p.total} 已学完
                        </span>
                        <span className="font-medium text-primary-600">
                          {p.percentage}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/60">
                        <div
                          className="h-full rounded-full bg-primary-500 transition-all duration-500"
                          style={{ width: `${p.percentage}%` }}
                        />
                      </div>
                      {p.inProgress > 0 && (
                        <span className="text-[10px] text-text-tertiary">
                          {p.inProgress} 个学习中
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-text-disabled">
                      加载中...
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 底部 Tab 导航 */}
      <nav className="border-t bg-surface px-4 pb-safe">
        <div className="mx-auto flex max-w-lg">
          {TAB_ITEMS.map((tab) => {
            const isActive = tab.key === "learn";
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
