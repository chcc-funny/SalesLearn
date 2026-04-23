"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { KnowledgeForm } from "@/components/shared/knowledge-form";

export default function NewKnowledgePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">
            新建知识点
          </h1>
          <Button variant="outline" onClick={() => router.push("/admin/knowledge")}>
            返回列表
          </Button>
        </div>
        <div className="rounded-lg border bg-surface p-6">
          <KnowledgeForm />
        </div>
      </div>
    </div>
  );
}
