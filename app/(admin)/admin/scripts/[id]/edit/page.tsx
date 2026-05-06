"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ScriptForm,
  type ScriptFormValues,
  type ScriptFormTagOption,
} from "@/components/admin/scripts/script-form";

/**
 * 管理端：编辑话术页（unit33）
 *
 * 流程：
 *  1. 拉取详情（GET /api/scripts/:id）+ 标签（GET /api/scripts/tags）
 *  2. 渲染 ScriptForm（mode='edit'）
 *  3. submit → PUT /api/admin/scripts/:id
 *  4. 成功 toast + 跳回 /admin/scripts
 *
 * 注：PUT 接口的 update schema 不暴露 status 字段（status 流转走 review/archive）；
 *    表单显示 status 仅作为「视图状态」，提交时不会改 status。
 */

interface ScriptTagDTO {
  id: string;
  name: string;
  groupKey: "scene" | "product";
}

interface ScriptDetailDTO {
  id: string;
  title: string;
  customerQuestion: string;
  answer: string;
  status: "draft" | "pending_review" | "published" | "rejected" | "archived";
  source: string;
  sceneTagIds?: string[];
  productTagIds?: string[];
  tags?: ScriptTagDTO[];
}

interface DetailResponse {
  success: boolean;
  data?: ScriptDetailDTO;
  error?: string;
}

interface TagsResponse {
  success: boolean;
  data?: { scene: ScriptTagDTO[]; product: ScriptTagDTO[] };
  error?: string;
}

function deriveTagIds(detail: ScriptDetailDTO) {
  // service 层 list/get 暂未承诺统一字段：兼容 sceneTagIds 数组 与 tags[{groupKey,id}] 两种返回
  if (detail.sceneTagIds && detail.productTagIds) {
    return {
      sceneTagIds: detail.sceneTagIds,
      productTagIds: detail.productTagIds,
    };
  }
  const sceneTagIds: string[] = [];
  const productTagIds: string[] = [];
  for (const t of detail.tags ?? []) {
    if (t.groupKey === "scene") sceneTagIds.push(t.id);
    else if (t.groupKey === "product") productTagIds.push(t.id);
  }
  return { sceneTagIds, productTagIds };
}

export default function EditScriptPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [sceneOptions, setSceneOptions] = useState<ScriptFormTagOption[]>([]);
  const [productOptions, setProductOptions] = useState<ScriptFormTagOption[]>(
    []
  );
  const [initialValues, setInitialValues] = useState<
    Partial<ScriptFormValues> | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 拉详情 + 标签
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [detailRes, tagsRes] = await Promise.all([
          fetch(`/api/scripts/${id}`),
          fetch("/api/scripts/tags?onlyActive=true"),
        ]);
        const detailJson: DetailResponse = await detailRes.json();
        const tagsJson: TagsResponse = await tagsRes.json();
        if (cancelled) return;

        if (!detailJson.success || !detailJson.data) {
          setLoadError(detailJson.error ?? "话术不存在");
          return;
        }
        const { sceneTagIds, productTagIds } = deriveTagIds(detailJson.data);
        const status: ScriptFormValues["status"] =
          detailJson.data.status === "published" ? "published" : "draft";
        setInitialValues({
          title: detailJson.data.title,
          customerQuestion: detailJson.data.customerQuestion,
          answer: detailJson.data.answer,
          sceneTagIds,
          productTagIds,
          status,
        });

        if (tagsJson.success && tagsJson.data) {
          setSceneOptions(
            tagsJson.data.scene.map((t) => ({
              id: t.id,
              name: t.name,
              groupKey: "scene" as const,
            }))
          );
          setProductOptions(
            tagsJson.data.product.map((t) => ({
              id: t.id,
              name: t.name,
              groupKey: "product" as const,
            }))
          );
        }
      } catch {
        if (!cancelled) setLoadError("加载失败，请稍后重试");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(values: ScriptFormValues) {
    if (!id) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/scripts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // PUT schema 不接受 status，传也会被 zod 静默丢弃
        body: JSON.stringify({
          title: values.title,
          customerQuestion: values.customerQuestion,
          answer: values.answer,
          sceneTagIds: values.sceneTagIds,
          productTagIds: values.productTagIds,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "保存失败");
        return;
      }
      toast.success("已保存");
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
            编辑话术
          </h1>
          <Button
            variant="outline"
            onClick={() => router.push("/admin/scripts")}
          >
            返回列表
          </Button>
        </div>

        <div className="rounded-lg border bg-surface p-6">
          {isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-text-tertiary">
              加载中...
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="flex min-h-[200px] items-center justify-center text-sm text-destructive"
            >
              {loadError}
            </div>
          ) : initialValues ? (
            <ScriptForm
              mode="edit"
              initialValues={initialValues}
              sceneOptions={sceneOptions}
              productOptions={productOptions}
              onSubmit={handleSubmit}
              onCancel={() => router.push("/admin/scripts")}
              isSubmitting={isSubmitting}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
