"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface QuestionItem {
  id: string;
  knowledgeTitle: string | null;
  type: string;
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanations: Record<string, string>;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  memory: "记忆题",
  understanding: "理解题",
  application: "应用题",
  analysis: "分析题",
};

export default function QuizReviewPage() {
  const router = useRouter();
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/quiz?status=reviewing");
      const json = await res.json();
      if (json.success) setItems(json.data);
    } catch {
      // 静默处理
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleReview(id: string, action: "approve" | "reject") {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/quiz/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.success) {
        setItems((prev) => prev.filter((q) => q.id !== id));
      }
    } catch {
      // 静默处理
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBatchApprove() {
    setActionLoading("batch");
    for (const item of items) {
      try {
        await fetch(`/api/quiz/${item.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        });
      } catch {
        // 继续处理下一个
      }
    }
    setActionLoading(null);
    fetchData();
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              题目审核
            </h1>
            <p className="text-sm text-text-secondary">
              {items.length} 道题目待审核
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/admin")}>
              返回管理后台
            </Button>
            {items.length > 0 && (
              <Button
                className="bg-success hover:bg-success/90 text-white"
                disabled={actionLoading === "batch"}
                onClick={handleBatchApprove}
              >
                {actionLoading === "batch"
                  ? "批量审核中..."
                  : `全部通过 (${items.length})`}
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-text-tertiary">加载中...</p>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-lg text-text-secondary">暂无待审核题目</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((q, idx) => {
              const isActioning = actionLoading === q.id;
              const explanations =
                typeof q.explanations === "object" && q.explanations
                  ? q.explanations
                  : {};

              return (
                <Card key={q.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-tertiary">
                          #{idx + 1}
                        </span>
                        <Badge variant="secondary">
                          {TYPE_LABELS[q.type] ?? q.type}
                        </Badge>
                      </div>
                      {q.knowledgeTitle && (
                        <CardDescription>{q.knowledgeTitle}</CardDescription>
                      )}
                    </div>
                    <CardTitle className="text-base">{q.questionText}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3 space-y-1.5">
                      {Array.isArray(q.options) &&
                        q.options.map((opt, j) => {
                          const letter = String.fromCharCode(65 + j);
                          const isCorrect = letter === q.correctAnswer;
                          return (
                            <div
                              key={j}
                              className={`rounded px-3 py-2 text-sm ${
                                isCorrect
                                  ? "bg-success-bg font-medium text-success"
                                  : "bg-surface-muted text-text-secondary"
                              }`}
                            >
                              <div>
                                {letter}. {opt}
                                {isCorrect && " ✓"}
                              </div>
                              {explanations[letter] && (
                                <p className="mt-0.5 text-xs text-text-tertiary">
                                  {explanations[letter]}
                                </p>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    <div className="flex gap-2 border-t pt-3">
                      <Button
                        size="sm"
                        className="bg-success hover:bg-success/90 text-white"
                        disabled={isActioning}
                        onClick={() => handleReview(q.id, "approve")}
                      >
                        通过
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-error text-error hover:bg-error-bg"
                        disabled={isActioning}
                        onClick={() => handleReview(q.id, "reject")}
                      >
                        驳回
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
