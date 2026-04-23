"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
  keyPoints: string[];
  content: string;
  examples: string | null;
  commonMistakes: string | null;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  product: "产品知识",
  objection: "客户异议",
  closing: "成交话术",
  psychology: "客户心理",
};

export default function ReviewPage() {
  const router = useRouter();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/knowledge?status=reviewing&limit=50");
      const json = await res.json();
      if (json.success) {
        setItems(json.data);
        setTotal(json.meta.total);
      }
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
      const res = await fetch(`/api/knowledge/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.success) {
        // 从列表中移除已审核的项
        setItems((prev) => prev.filter((item) => item.id !== id));
        setTotal((prev) => prev - 1);
      }
    } catch {
      // 静默处理
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">审核管理</h1>
            <p className="text-sm text-text-secondary">
              {total} 个知识点待审核
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/admin")}>
            返回管理后台
          </Button>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-text-tertiary">加载中...</p>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-lg text-text-secondary">暂无待审核知识点</p>
            <p className="mt-1 text-sm text-text-tertiary">
              所有知识点已审核完毕
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              const isActioning = actionLoading === item.id;

              return (
                <Card key={item.id}>
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : item.id)
                    }
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {item.title}
                        </CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-2">
                          <Badge variant="outline">
                            {CATEGORY_LABELS[item.category] ?? item.category}
                          </Badge>
                          <span>
                            {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                          </span>
                        </CardDescription>
                      </div>
                      <span className="text-xs text-text-tertiary">
                        {isExpanded ? "收起" : "展开"}
                      </span>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-4">
                      {/* 核心要点 */}
                      {Array.isArray(item.keyPoints) &&
                        item.keyPoints.length > 0 && (
                          <div>
                            <h4 className="mb-1 text-sm font-medium text-text-primary">
                              核心要点
                            </h4>
                            <ul className="list-inside list-disc space-y-0.5 text-sm text-text-secondary">
                              {item.keyPoints.map((p, i) => (
                                <li key={i}>{p}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {/* 详细内容 */}
                      <div>
                        <h4 className="mb-1 text-sm font-medium text-text-primary">
                          详细内容
                        </h4>
                        <p className="whitespace-pre-wrap text-sm text-text-secondary">
                          {item.content}
                        </p>
                      </div>

                      {/* 案例 */}
                      {item.examples && (
                        <div>
                          <h4 className="mb-1 text-sm font-medium text-text-primary">
                            案例/话术
                          </h4>
                          <p className="whitespace-pre-wrap rounded bg-surface-muted p-3 text-sm text-text-secondary">
                            {item.examples}
                          </p>
                        </div>
                      )}

                      {/* 常见误区 */}
                      {item.commonMistakes && (
                        <div>
                          <h4 className="mb-1 text-sm font-medium text-text-primary">
                            常见误区
                          </h4>
                          <p className="whitespace-pre-wrap text-sm text-text-secondary">
                            {item.commonMistakes}
                          </p>
                        </div>
                      )}

                      {/* 操作按钮 */}
                      <div className="flex gap-3 border-t pt-4">
                        <Button
                          className="bg-success hover:bg-success/90 text-white"
                          disabled={isActioning}
                          onClick={() => handleReview(item.id, "approve")}
                        >
                          {isActioning ? "处理中..." : "通过发布"}
                        </Button>
                        <Button
                          variant="outline"
                          className="border-error text-error hover:bg-error-bg"
                          disabled={isActioning}
                          onClick={() => handleReview(item.id, "reject")}
                        >
                          驳回修改
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
