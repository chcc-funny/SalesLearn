"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface KnowledgeDetail {
  id: string;
  title: string;
  category: string;
  keyPoints: string[];
  content: string;
  examples: string | null;
  commonMistakes: string | null;
  images: string[];
}

const CATEGORY_TITLES: Record<string, string> = {
  product: "产品知识",
  objection: "客户异议",
  closing: "成交话术",
  psychology: "客户心理",
};

export default function KnowledgeDetailPage() {
  const params = useParams<{ category: string; id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<KnowledgeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const startTimeRef = useRef(Date.now());

  // 发送学习进度
  const sendProgress = useCallback(
    async (extra?: { markCompleted?: boolean }) => {
      if (!params.id) return;
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      try {
        const res = await fetch("/api/learning/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            knowledgeId: params.id,
            viewDuration: elapsed,
            scrollDepth: 1, // 详情页默认视为完整浏览
            ...extra,
          }),
        });
        const json = await res.json();
        if (json.success && json.data?.isCompleted) {
          setIsCompleted(true);
        }
      } catch {
        // 静默处理
      }
      startTimeRef.current = Date.now();
    },
    [params.id]
  );

  // 离开页面时上报进度
  useEffect(() => {
    return () => {
      sendProgress();
    };
  }, [sendProgress]);

  // 手动标记完成
  async function handleMarkComplete() {
    setMarkingComplete(true);
    await sendProgress({ markCompleted: true });
    setMarkingComplete(false);
  }

  useEffect(() => {
    async function fetchDetail() {
      try {
        const res = await fetch(`/api/knowledge/${params.id}`);
        const json = await res.json();
        if (json.success) {
          setItem(json.data);
        } else {
          setError(json.error ?? "加载失败");
        }
      } catch {
        setError("网络错误");
      } finally {
        setIsLoading(false);
      }
    }
    fetchDetail();
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-tertiary">加载中...</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <p className="text-error">{error || "知识点不存在"}</p>
        <Button variant="outline" onClick={() => router.back()}>
          返回
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶栏 */}
      <div className="sticky top-0 z-10 border-b bg-surface/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            onClick={() => router.push(`/learn/${params.category}`)}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            ← {CATEGORY_TITLES[params.category] ?? "返回"}
          </button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              router.push(`/test?knowledgeId=${item.id}`)
            }
          >
            去测试
          </Button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* 标题 */}
        <h1 className="text-xl font-semibold text-text-primary">
          {item.title}
        </h1>
        <span className="mt-1 inline-block rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700">
          {CATEGORY_TITLES[item.category] ?? item.category}
        </span>

        {/* 核心要点 */}
        {Array.isArray(item.keyPoints) && item.keyPoints.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary-600">
              核心要点
            </h2>
            <div className="space-y-2">
              {item.keyPoints.map((point, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg bg-primary-50 p-3"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="text-sm font-medium text-text-primary">
                    {point}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 图片展示 */}
        {Array.isArray(item.images) && item.images.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-secondary">
              配图
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {item.images.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`配图 ${i + 1}`}
                  className="rounded-lg object-cover"
                />
              ))}
            </div>
          </section>
        )}

        {/* 详细说明 */}
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-secondary">
            详细说明
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
            {item.content}
          </p>
        </section>

        {/* 案例话术 */}
        {item.examples && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-secondary">
              案例话术
            </h2>
            <div className="rounded-xl bg-success-bg p-4">
              <p className="whitespace-pre-wrap text-sm text-text-primary">
                {item.examples}
              </p>
            </div>
          </section>
        )}

        {/* 常见误区 */}
        {item.commonMistakes && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-error">
              常见误区
            </h2>
            <div className="rounded-xl bg-error-bg p-4">
              <p className="whitespace-pre-wrap text-sm text-text-primary">
                {item.commonMistakes}
              </p>
            </div>
          </section>
        )}

        {/* 完成状态 + 底部操作 */}
        <div className="mt-8 border-t pt-6">
          {isCompleted ? (
            <div className="mb-4 flex items-center gap-2">
              <Badge variant="default" className="bg-success">已学完</Badge>
              <span className="text-sm text-text-secondary">
                你已掌握这个知识点
              </span>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mb-4 border-success text-success hover:bg-success-bg"
              disabled={markingComplete}
              onClick={handleMarkComplete}
            >
              {markingComplete ? "标记中..." : "标记已学完"}
            </Button>
          )}

          <div className="flex gap-3">
            <Button
              className="bg-primary-500 hover:bg-primary-600"
              onClick={() =>
                router.push(`/test?knowledgeId=${item.id}`)
              }
            >
              去测试一下
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/learn/${params.category}`)}
            >
              继续学习
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
