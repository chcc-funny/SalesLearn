"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { KnowledgeCard } from "@/components/shared/knowledge-card";

interface KnowledgeItem {
  id: string;
  title: string;
  keyPoints: string[];
  content: string;
  examples: string | null;
}

const CATEGORY_TITLES: Record<string, string> = {
  product: "产品知识",
  objection: "客户异议",
  closing: "成交话术",
  psychology: "客户心理",
};

export default function CategoryLearnPage() {
  const params = useParams<{ category: string }>();
  const router = useRouter();
  const category = params.category;

  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [touchStartX, setTouchStartX] = useState(0);

  useEffect(() => {
    async function fetchCards() {
      try {
        const res = await fetch(
          `/api/knowledge?category=${category}&status=published&limit=50`
        );
        const json = await res.json();
        if (json.success) {
          setItems(json.data);
        }
      } catch {
        // 静默处理
      } finally {
        setIsLoading(false);
      }
    }
    fetchCards();
  }, [category]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, items.length - 1));
  }, [items.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  // 键盘导航
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goNext();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") goPrev();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
  }

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const currentItem = items[currentIndex];
  const progress =
    items.length > 0 ? ((currentIndex + 1) / items.length) * 100 : 0;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-tertiary">加载中...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="text-lg text-text-secondary">暂无知识点</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/learn")}
        >
          返回学习中心
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => router.push("/learn")}
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          ← 返回
        </button>
        <h1 className="text-base font-medium text-text-primary">
          {CATEGORY_TITLES[category] ?? category}
        </h1>
        <span className="text-xs text-text-tertiary">
          {currentIndex + 1}/{items.length}
        </span>
      </div>

      {/* 进度条 */}
      <div className="mx-4 h-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 卡片区域 */}
      <div className="flex-1 px-4 py-4">
        {currentItem && (
          <KnowledgeCard
            title={currentItem.title}
            keyPoints={currentItem.keyPoints}
            content={currentItem.content}
            examples={currentItem.examples}
            isFavorited={favorites.has(currentItem.id)}
            onToggleFavorite={() => toggleFavorite(currentItem.id)}
          />
        )}
      </div>

      {/* 底部导航 */}
      <div className="border-t bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={currentIndex === 0}
            onClick={goPrev}
          >
            上一张
          </Button>
          {currentIndex === items.length - 1 ? (
            <Button
              size="sm"
              className="bg-primary-500 hover:bg-primary-600"
              onClick={() =>
                router.push(`/test?category=${category}`)
              }
            >
              去测试一下
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-primary-500 hover:bg-primary-600"
              onClick={goNext}
            >
              下一张
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
