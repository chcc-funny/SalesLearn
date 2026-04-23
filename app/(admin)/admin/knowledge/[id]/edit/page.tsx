"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { KnowledgeForm } from "@/components/shared/knowledge-form";

interface KnowledgeData {
  title: string;
  category: string;
  keyPoints: string[];
  content: string;
  examples: string | null;
  commonMistakes: string | null;
}

export default function EditKnowledgePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/knowledge/${params.id}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error ?? "加载失败");
        }
      } catch {
        setError("加载失败");
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-tertiary">加载中...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-error">{error || "知识点不存在"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">
            编辑知识点
          </h1>
          <Button variant="outline" onClick={() => router.push("/admin/knowledge")}>
            返回列表
          </Button>
        </div>
        <div className="rounded-lg border bg-surface p-6">
          <KnowledgeForm
            knowledgeId={params.id}
            initialData={{
              title: data.title,
              category: data.category,
              keyPoints: data.keyPoints,
              content: data.content,
              examples: data.examples ?? "",
              commonMistakes: data.commonMistakes ?? "",
            }}
          />
        </div>
      </div>
    </div>
  );
}
