"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ScriptForm,
  type ScriptFormValues,
  type ScriptFormTagOption,
} from "@/components/admin/scripts/script-form";

/**
 * 管理端：新建话术页（unit33）
 *
 * 流程：
 *  1. 拉取标签选项（GET /api/scripts/tags）
 *  2. 渲染 ScriptForm（mode='create'）
 *  3. submit → POST /api/admin/scripts（强制 source='curated'）
 *  4. 成功 toast + 跳回 /admin/scripts
 */

interface ScriptTagDTO {
  id: string;
  name: string;
  groupKey: "scene" | "product";
}

interface TagsResponse {
  success: boolean;
  data?: { scene: ScriptTagDTO[]; product: ScriptTagDTO[] };
  error?: string;
}

export default function NewScriptPage() {
  const router = useRouter();
  const [sceneOptions, setSceneOptions] = useState<ScriptFormTagOption[]>([]);
  const [productOptions, setProductOptions] = useState<ScriptFormTagOption[]>(
    []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 拉标签
  useEffect(() => {
    let cancelled = false;
    async function fetchTags() {
      try {
        const res = await fetch("/api/scripts/tags?onlyActive=true");
        const json: TagsResponse = await res.json();
        if (cancelled) return;
        if (json.success && json.data) {
          setSceneOptions(
            json.data.scene.map((t) => ({
              id: t.id,
              name: t.name,
              groupKey: "scene" as const,
            }))
          );
          setProductOptions(
            json.data.product.map((t) => ({
              id: t.id,
              name: t.name,
              groupKey: "product" as const,
            }))
          );
        }
      } catch {
        // 标签拉取失败不阻塞表单
      }
    }
    fetchTags();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(values: ScriptFormValues) {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title,
          customerQuestion: values.customerQuestion,
          answer: values.answer,
          // 管理端手工录入固定 source='curated'
          source: "curated",
          status: values.status,
          sceneTagIds: values.sceneTagIds,
          productTagIds: values.productTagIds,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "创建失败");
        return;
      }
      toast.success("话术创建成功");
      router.push("/admin/scripts");
      router.refresh();
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">
            新建话术
          </h1>
          <Button
            variant="outline"
            onClick={() => router.push("/admin/scripts")}
          >
            返回列表
          </Button>
        </div>
        <div className="rounded-lg border bg-surface p-6">
          <ScriptForm
            mode="create"
            sceneOptions={sceneOptions}
            productOptions={productOptions}
            onSubmit={handleSubmit}
            onCancel={() => router.push("/admin/scripts")}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
