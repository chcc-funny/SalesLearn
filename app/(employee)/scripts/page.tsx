"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ScriptFilters,
  type ScriptFiltersValue,
  type ScriptFiltersTagOption,
} from "@/components/scripts/script-filters";
import { ScriptList } from "@/components/scripts/script-list";
import type { ScriptCardData } from "@/components/scripts/script-card";
import { GenerateDialog } from "@/components/scripts/generate-dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

/**
 * 员工端：精选话术列表页 `/scripts`（unit29）
 *
 * 数据流：
 *  - 标签：GET /api/scripts/tags（unit14）→ 用于筛选组件
 *  - 列表：GET /api/scripts（unit15）→ ScriptList 渲染
 *  - 复制：POST /api/scripts/:id/copy（unit17）→ 写入剪贴板 + toast
 *
 * 复用项目既有页面风格（参考 dashboard / learn / test）：
 *  - 顶部页头 + 主体内容 + 底部 Tab 导航
 *  - useDebounce 控制搜索输入
 *  - 错误用 sonner toast 透出
 */

// ----------------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------------

interface ScriptListItemDTO {
  id: string;
  title: string;
  customerQuestion: string;
  answer: string;
  status: ScriptCardData["status"];
  usageCount: number;
}

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

interface ListResponse {
  success: boolean;
  data?: ScriptListItemDTO[];
  meta?: { total: number; page: number; limit: number };
  error?: string;
}

const DEFAULT_FILTERS: ScriptFiltersValue = {
  q: "",
  sceneTagIds: [],
  productTagIds: [],
  sortBy: "updated_desc",
};

const TAB_ITEMS = [
  { key: "learn", label: "学习", icon: "📚", path: "/learn" },
  { key: "scripts", label: "话术", icon: "💡", path: "/scripts" },
  { key: "test", label: "测试", icon: "📝", path: "/test" },
  { key: "feynman", label: "讲解", icon: "🎤", path: "/feynman" },
  { key: "dashboard", label: "我的", icon: "👤", path: "/dashboard" },
];

// ----------------------------------------------------------------------------
// 页面
// ----------------------------------------------------------------------------

export default function EmployeeScriptsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<ScriptFiltersValue>(DEFAULT_FILTERS);
  const debouncedQ = useDebounce(filters.q, 300);

  const [sceneOptions, setSceneOptions] = useState<ScriptFiltersTagOption[]>(
    []
  );
  const [productOptions, setProductOptions] = useState<
    ScriptFiltersTagOption[]
  >([]);
  const [scripts, setScripts] = useState<ScriptCardData[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  // unit47：AI 生成弹窗开关
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);

  // ------------------------------------------------------------------------
  // 拉标签（一次性）
  // ------------------------------------------------------------------------
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
              groupKey: "scene",
            }))
          );
          setProductOptions(
            json.data.product.map((t) => ({
              id: t.id,
              name: t.name,
              groupKey: "product",
            }))
          );
        }
      } catch {
        // 标签拉失败不阻塞列表渲染，仅在控制台外保持静默
      }
    }
    fetchTags();
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------------------
  // 拉列表（filters / debouncedQ 变化触发）
  // ------------------------------------------------------------------------
  const fetchList = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      filters.sceneTagIds.forEach((id) =>
        params.append("sceneTagIds", id)
      );
      filters.productTagIds.forEach((id) =>
        params.append("productTagIds", id)
      );
      params.set("page", "1");
      params.set("pageSize", "30");

      const res = await fetch(`/api/scripts?${params.toString()}`);
      const json: ListResponse = await res.json();

      if (!json.success || !json.data) {
        setScripts([]);
        setListError(json.error ?? "加载话术列表失败");
        return;
      }

      // DTO → ScriptCardData（v1 列表暂不带 tags，留空数组）
      setScripts(
        json.data.map((row) => ({
          id: row.id,
          title: row.title,
          customerQuestion: row.customerQuestion,
          answer: row.answer,
          status: row.status,
          usageCount: row.usageCount,
          tags: [],
        }))
      );
    } catch {
      setScripts([]);
      setListError("网络异常，请稍后重试");
    } finally {
      setIsLoadingList(false);
    }
  }, [debouncedQ, filters.sceneTagIds, filters.productTagIds]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // ------------------------------------------------------------------------
  // 客户端排序（v1 后端按 updatedAt desc 返回；前端再按 sortBy 切换排序视图）
  // ------------------------------------------------------------------------
  const visibleScripts = useMemo(() => {
    const list = [...scripts];
    if (filters.sortBy === "usage_desc") {
      list.sort((a, b) => b.usageCount - a.usageCount);
    }
    // updated_desc / created_desc 后端已 desc 排序，无需重排
    return list;
  }, [scripts, filters.sortBy]);

  // ------------------------------------------------------------------------
  // 复制
  // ------------------------------------------------------------------------
  async function handleCopy(script: ScriptCardData) {
    if (copyingId) return; // 防止并发
    setCopyingId(script.id);

    // 1. 写入剪贴板（best effort；不阻塞 API 调用）
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(script.answer);
      }
    } catch {
      // 剪贴板权限拒绝时静默；toast 仍走成功路径（API 会记录使用次数）
    }

    // 2. 调用 copy 接口（usage_count 自增 + 日志）
    try {
      const res = await fetch(`/api/scripts/${script.id}/copy`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "复制失败");
      } else {
        toast.success("已复制到剪贴板");
        // 乐观更新本地 usageCount
        setScripts((prev) =>
          prev.map((s) =>
            s.id === script.id
              ? { ...s, usageCount: s.usageCount + 1 }
              : s
          )
        );
      }
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setCopyingId(null);
    }
  }

  // ------------------------------------------------------------------------
  // 渲染
  // ------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 顶部页头 */}
      <div className="px-4 pb-2 pt-6">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">
              精选话术
            </h1>
            <p className="text-sm text-text-secondary">
              一键复制经审核的标准答案，遇到客户问题不再卡壳
            </p>
          </div>
          {/* unit47：AI 生成入口 */}
          <Button
            type="button"
            size="sm"
            onClick={() => setIsGenerateOpen(true)}
            aria-label="AI 生成话术"
          >
            <Sparkles className="mr-1 h-4 w-4" />
            AI 生成
          </Button>
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 px-4 pb-6 pt-2">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <ScriptFilters
            value={filters}
            sceneOptions={sceneOptions}
            productOptions={productOptions}
            onChange={setFilters}
          />
          <ScriptList
            scripts={visibleScripts}
            isLoading={isLoadingList}
            error={listError}
            onCopy={handleCopy}
            emptyText="没有匹配的话术，换个关键词或清除筛选试试"
          />
        </div>
      </div>

      {/* unit47：AI 生成弹窗 */}
      <GenerateDialog
        open={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        onSubmitted={() => {
          // 提交成功后关闭弹窗 + 刷新列表（员工端列表 status='published'，
          // 新提交的草稿待审核状态不会出现在此列表，但保持刷新避免使用次数等数据滞后）
          setIsGenerateOpen(false);
          fetchList();
        }}
      />

      {/* 底部 Tab 导航 */}
      <nav className="border-t bg-surface px-4 pb-safe">
        <div className="mx-auto flex max-w-lg">
          {TAB_ITEMS.map((tab) => {
            const isActive = tab.key === "scripts";
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
