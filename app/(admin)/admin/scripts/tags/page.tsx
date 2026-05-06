"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  TagManager,
  type TagManagerTag,
  type TagManagerGroupKey,
} from "@/components/admin/scripts/tag-manager";

/**
 * 管理端：精选话术 - 标签管理页（unit34）
 *
 * 功能：
 *  - GET /api/admin/script-tags 拉全量（含停用）
 *  - POST /api/admin/script-tags 新建
 *  - PUT /api/admin/script-tags/:id 重命名
 *  - DELETE /api/admin/script-tags/:id 软删（is_active=false）
 *  - 上下移动 = PUT 两条记录的 sortOrder（前端交换序号 + 两次 PUT）
 *
 * 权限：依赖后端 manager-only；UI 上失败 toast 即可
 *
 * 列表展示：onlyActive=false 看全量，前端再 filter is_active=true 才进 TagManager
 *  （v1 不展示已停用标签的「重新启用」UX；停用后可在数据库手工恢复）
 */

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface ScriptTagDTO {
  id: string;
  name: string;
  groupKey: TagManagerGroupKey;
  sortOrder: number;
  isActive: boolean;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export default function AdminScriptTagsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<TagManagerTag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  const fetchTags = useCallback(async () => {
    try {
      // onlyActive=true 仅展示在用的；停用的标签不在管理界面里再次展示（v1 简化）
      const res = await fetch(
        "/api/admin/script-tags?onlyActive=true",
        { cache: "no-store" }
      );
      const json: ApiResponse<ScriptTagDTO[]> = await res.json();
      if (!json.success || !json.data) {
        toast.error(json.error ?? "加载标签失败");
        setTags([]);
        return;
      }
      const mapped = json.data.map<TagManagerTag>((t) => ({
        id: t.id,
        name: t.name,
        groupKey: t.groupKey,
        sortOrder: t.sortOrder,
        isActive: t.isActive,
      }));
      setTags(mapped);
    } catch {
      toast.error("网络异常，请稍后重试");
      setTags([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // ----------------------------------------------------------------
  // 新建
  // ----------------------------------------------------------------
  const handleCreate = useCallback(
    async (groupKey: TagManagerGroupKey, name: string) => {
      setIsMutating(true);
      try {
        // 同 group 现有最大 sortOrder + 1
        const sameGroup = tags.filter((t) => t.groupKey === groupKey);
        const nextSort =
          sameGroup.length === 0
            ? 0
            : Math.max(...sameGroup.map((t) => t.sortOrder)) + 1;

        const res = await fetch("/api/admin/script-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupKey,
            name,
            sortOrder: nextSort,
            isActive: true,
          }),
        });
        const json: ApiResponse<ScriptTagDTO> = await res.json();
        if (!json.success) {
          toast.error(json.error ?? "新建标签失败");
          return;
        }
        toast.success("已创建");
        await fetchTags();
      } catch {
        toast.error("网络异常，请稍后重试");
      } finally {
        setIsMutating(false);
      }
    },
    [tags, fetchTags]
  );

  // ----------------------------------------------------------------
  // 编辑
  // ----------------------------------------------------------------
  const handleUpdate = useCallback(
    async (id: string, patch: { name: string }) => {
      setIsMutating(true);
      try {
        const res = await fetch(`/api/admin/script-tags/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: patch.name }),
        });
        const json: ApiResponse<ScriptTagDTO> = await res.json();
        if (!json.success) {
          toast.error(json.error ?? "保存失败");
          return;
        }
        toast.success("已保存");
        await fetchTags();
      } catch {
        toast.error("网络异常，请稍后重试");
      } finally {
        setIsMutating(false);
      }
    },
    [fetchTags]
  );

  // ----------------------------------------------------------------
  // 删除（软删）
  // ----------------------------------------------------------------
  const handleDelete = useCallback(
    async (id: string) => {
      const confirm = window.confirm(
        "确认删除该标签？历史关联将保留，但员工筛选不再展示。"
      );
      if (!confirm) return;
      setIsMutating(true);
      try {
        const res = await fetch(`/api/admin/script-tags/${id}`, {
          method: "DELETE",
        });
        const json: ApiResponse<{ deleted: boolean }> = await res.json();
        if (!json.success) {
          toast.error(json.error ?? "删除失败");
          return;
        }
        toast.success("已删除");
        await fetchTags();
      } catch {
        toast.error("网络异常，请稍后重试");
      } finally {
        setIsMutating(false);
      }
    },
    [fetchTags]
  );

  // ----------------------------------------------------------------
  // 排序：交换两个相邻标签的 sortOrder（仅在前端层面计算后串行 PUT）
  // ----------------------------------------------------------------
  const handleMove = useCallback(
    async (
      groupKey: TagManagerGroupKey,
      id: string,
      direction: "up" | "down"
    ) => {
      const sameGroupSorted = [...tags]
        .filter((t) => t.groupKey === groupKey)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = sameGroupSorted.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sameGroupSorted.length) return;

      const a = sameGroupSorted[idx];
      const b = sameGroupSorted[swapIdx];

      setIsMutating(true);
      try {
        // 注意：用 a.sortOrder/b.sortOrder 直接交换；如果两者相等会保持原样，
        // 此时退化用 swap idx 序号兜底
        const aNewSort = a.sortOrder === b.sortOrder ? swapIdx : b.sortOrder;
        const bNewSort = a.sortOrder === b.sortOrder ? idx : a.sortOrder;

        const [r1, r2] = await Promise.all([
          fetch(`/api/admin/script-tags/${a.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: aNewSort }),
          }),
          fetch(`/api/admin/script-tags/${b.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: bNewSort }),
          }),
        ]);
        const j1: ApiResponse<ScriptTagDTO> = await r1.json();
        const j2: ApiResponse<ScriptTagDTO> = await r2.json();
        if (!j1.success || !j2.success) {
          toast.error("排序失败，请刷新后重试");
          return;
        }
        await fetchTags();
      } catch {
        toast.error("网络异常，请稍后重试");
      } finally {
        setIsMutating(false);
      }
    },
    [tags, fetchTags]
  );

  const totals = useMemo(() => {
    let scene = 0;
    let product = 0;
    for (const t of tags) {
      if (t.groupKey === "scene") scene++;
      else if (t.groupKey === "product") product++;
    }
    return { scene, product };
  }, [tags]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              精选话术 - 标签管理
            </h1>
            <p className="text-sm text-text-secondary">
              场景 {totals.scene} 个 / 产品 {totals.product} 个
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/admin/scripts")}
            >
              返回话术列表
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-lg border bg-surface p-12 text-center text-text-tertiary">
            加载中...
          </div>
        ) : (
          <TagManager
            tags={tags}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onMove={handleMove}
            isLoading={isMutating}
          />
        )}
      </div>
    </div>
  );
}
