"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useDebounce } from "@/hooks/use-debounce";
import {
  ReviewPanel,
  type ReviewPanelEdits,
  type ReviewPanelScript,
} from "@/components/admin/scripts/review-panel";

/**
 * 管理端：精选话术列表页（unit32）
 *
 * 功能：
 *  - GET /api/admin/scripts 拉列表（分页 + 筛选）
 *  - 筛选：status / scene / product / 关键字（debounce 300ms）
 *  - 操作：编辑（跳转）/ 归档（POST /api/admin/scripts/:id/archive）
 *  - 「新建话术」跳 /admin/scripts/new
 *  - 「从知识库生成」MVP 占位（弹 toast 「未启用 AI」）
 *
 * 参考 components/admin/knowledge/* 与 app/(admin)/admin/knowledge/page.tsx 风格
 */

interface ScriptTagDTO {
  id: string;
  name: string;
  groupKey: "scene" | "product";
}

interface ScriptListItemDTO {
  id: string;
  title: string;
  status: "draft" | "pending_review" | "published" | "rejected" | "archived";
  source: string;
  customerQuestion: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  tags?: ScriptTagDTO[];
}

interface ListResponse {
  success: boolean;
  data?: ScriptListItemDTO[];
  meta?: { total: number; page: number; limit: number };
  error?: string;
}

interface TagsResponse {
  success: boolean;
  data?: { scene: ScriptTagDTO[]; product: ScriptTagDTO[] };
  error?: string;
}

const STATUS_OPTIONS: {
  value: string;
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
}[] = [
  { value: "draft", label: "草稿", variant: "secondary" },
  { value: "pending_review", label: "待审核", variant: "outline" },
  { value: "published", label: "已发布", variant: "default" },
  { value: "rejected", label: "已拒绝", variant: "destructive" },
  { value: "archived", label: "已归档", variant: "secondary" },
];

const STATUS_MAP: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, { label: s.label, variant: s.variant }])
);

const PAGE_SIZE = 20;

const TAB_VALUES = [
  "all",
  "pending_review",
  "published",
  "draft",
  "rejected",
  "archived",
] as const;
type TabValue = (typeof TAB_VALUES)[number];

const TAB_LABELS: Record<TabValue, string> = {
  all: "全部",
  pending_review: "待审核",
  published: "已发布",
  draft: "草稿",
  rejected: "已拒绝",
  archived: "已归档",
};

interface ScriptsTableProps {
  items: ScriptListItemDTO[];
  isLoading: boolean;
  onEdit: (id: string) => void;
  onArchive: (item: ScriptListItemDTO) => void;
}

function ScriptsTable({ items, isLoading, onEdit, onArchive }: ScriptsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[35%]">标题</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>标签</TableHead>
          <TableHead>创建时间</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell
              colSpan={5}
              className="py-12 text-center text-text-tertiary"
            >
              加载中...
            </TableCell>
          </TableRow>
        ) : items.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={5}
              className="py-12 text-center text-text-tertiary"
            >
              暂无话术
            </TableCell>
          </TableRow>
        ) : (
          items.map((item) => {
            const cfg = STATUS_MAP[item.status] ?? {
              label: item.status,
              variant: "secondary" as const,
            };
            const tagNames =
              item.tags?.map((t) => t.name).filter(Boolean) ?? [];
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.title}</TableCell>
                <TableCell>
                  <Badge variant={cfg.variant}>{cfg.label}</Badge>
                </TableCell>
                <TableCell className="text-xs text-text-tertiary">
                  {tagNames.length > 0 ? tagNames.join(" / ") : "—"}
                </TableCell>
                <TableCell className="text-text-tertiary">
                  {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(item.id)}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={item.status !== "published"}
                    onClick={() => onArchive(item)}
                  >
                    归档
                  </Button>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

export default function AdminScriptsPage() {
  const router = useRouter();

  const [items, setItems] = useState<ScriptListItemDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<TabValue>("all");
  const [sceneFilter, setSceneFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText, 300);
  const [isLoading, setIsLoading] = useState(true);
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false);

  const [sceneOptions, setSceneOptions] = useState<ScriptTagDTO[]>([]);
  const [productOptions, setProductOptions] = useState<ScriptTagDTO[]>([]);

  const [archiveTarget, setArchiveTarget] = useState<ScriptListItemDTO | null>(
    null
  );
  const [isArchiving, setIsArchiving] = useState(false);
  const [fromKnowledgeOpen, setFromKnowledgeOpen] = useState(false);

  // tab → status filter 映射；"all" 表示不传 status
  const statusFilter: string = tab === "all" ? "all" : tab;

  // ----------------------------------------------------------------------
  // 拉标签（一次性）
  // ----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    async function fetchTags() {
      try {
        const res = await fetch("/api/scripts/tags?onlyActive=true");
        const json: TagsResponse = await res.json();
        if (cancelled) return;
        if (json.success && json.data) {
          setSceneOptions(json.data.scene);
          setProductOptions(json.data.product);
        }
      } catch {
        // 标签拉失败不阻塞表格渲染
      }
    }
    fetchTags();
    return () => {
      cancelled = true;
    };
  }, []);

  // ----------------------------------------------------------------------
  // 筛选变化时回到第一页
  // ----------------------------------------------------------------------
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab, sceneFilter, productFilter]);

  // ----------------------------------------------------------------------
  // 拉列表
  // ----------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (sceneFilter !== "all") params.append("sceneTagIds", sceneFilter);
      if (productFilter !== "all")
        params.append("productTagIds", productFilter);
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());

      const res = await fetch(`/api/admin/scripts?${params.toString()}`);
      const json: ListResponse = await res.json();

      if (!json.success || !json.data) {
        toast.error(json.error ?? "加载话术列表失败");
        setItems([]);
        setTotal(0);
        return;
      }

      setItems(json.data);
      setTotal(json.meta?.total ?? 0);
    } catch {
      toast.error("网络异常，请稍后重试");
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, sceneFilter, productFilter, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  // ----------------------------------------------------------------------
  // 审核（通过 / 驳回）
  // ----------------------------------------------------------------------
  async function handleApprove(id: string, edits: ReviewPanelEdits) {
    setIsReviewSubmitting(true);
    try {
      const res = await fetch(`/api/admin/scripts/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          edits: {
            title: edits.title,
            customerQuestion: edits.customerQuestion,
            answer: edits.answer,
            sceneTagIds: edits.sceneTagIds,
            productTagIds: edits.productTagIds,
          },
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "审核通过失败");
        return;
      }
      toast.success("已通过审核并发布");
      // 从当前列表移除（pending_review tab 下立即消失）
      setItems((prev) => prev.filter((x) => x.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsReviewSubmitting(false);
    }
  }

  async function handleReject(id: string, reason: string) {
    setIsReviewSubmitting(true);
    try {
      const res = await fetch(`/api/admin/scripts/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectReason: reason }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "驳回失败");
        return;
      }
      toast.success("已驳回");
      setItems((prev) => prev.filter((x) => x.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsReviewSubmitting(false);
    }
  }

  // 列表项 → ReviewPanelScript（pending_review tab 下用）
  const reviewItems: ReviewPanelScript[] = useMemo(
    () =>
      items
        .filter((it) => it.status === "pending_review")
        .map((it) => ({
          id: it.id,
          title: it.title,
          customerQuestion: it.customerQuestion,
          // listScripts 列表接口未必返回 answer 全文；缺失时用空串占位（v1 简化）
          answer: (it as ScriptListItemDTO & { answer?: string }).answer ?? "",
          status: "pending_review" as const,
          source: it.source,
          createdAt: it.createdAt,
          tags: it.tags ?? [],
          sceneTagIds:
            it.tags?.filter((t) => t.groupKey === "scene").map((t) => t.id) ??
            [],
          productTagIds:
            it.tags?.filter((t) => t.groupKey === "product").map((t) => t.id) ??
            [],
        })),
    [items]
  );

  // ----------------------------------------------------------------------
  // 归档
  // ----------------------------------------------------------------------
  async function confirmArchive() {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      const res = await fetch(
        `/api/admin/scripts/${archiveTarget.id}/archive`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "归档失败");
        return;
      }
      toast.success("已归档");
      setArchiveTarget(null);
      await fetchData();
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsArchiving(false);
    }
  }

  // ----------------------------------------------------------------------
  // 渲染
  // ----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              精选话术管理
            </h1>
            <p className="text-sm text-text-secondary">共 {total} 条话术</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push("/admin")}>
              返回管理后台
            </Button>
            <Button
              variant="outline"
              onClick={() => setFromKnowledgeOpen(true)}
            >
              从知识库生成
            </Button>
            <Button
              className="bg-primary-500 hover:bg-primary-600"
              onClick={() => router.push("/admin/scripts/new")}
            >
              新建话术
            </Button>
          </div>
        </div>

        {/* Tab 切换：全部 / 待审核 / 已发布 / 草稿 / 已拒绝 / 已归档 */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList className="mb-4">
            {TAB_VALUES.map((v) => (
              <TabsTrigger key={v} value={v}>
                {TAB_LABELS[v]}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* 筛选栏（搜索/场景/产品） — status 已由 Tab 驱动，这里不再展示状态筛选 */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索标题/客户问题..."
              className="w-[260px]"
              aria-label="搜索话术"
            />

            <Select
              value={sceneFilter}
              onValueChange={(v) => setSceneFilter(v)}
            >
              <SelectTrigger className="w-[160px]" aria-label="场景筛选">
                <SelectValue placeholder="场景筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部场景</SelectItem>
                {sceneOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={productFilter}
              onValueChange={(v) => setProductFilter(v)}
            >
              <SelectTrigger className="w-[160px]" aria-label="产品筛选">
                <SelectValue placeholder="产品筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部产品</SelectItem>
                {productOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 待审核 Tab：使用 ReviewPanel */}
          <TabsContent value="pending_review">
            <ReviewPanel
              scripts={reviewItems}
              isLoading={isLoading}
              isSubmitting={isReviewSubmitting}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </TabsContent>

          {/* 其它 Tab：复用同一张表格 */}
          {TAB_VALUES.filter((v) => v !== "pending_review").map((v) => (
            <TabsContent key={v} value={v}>
              <ScriptsTable
                items={items}
                isLoading={isLoading}
                onEdit={(id) => router.push(`/admin/scripts/${id}/edit`)}
                onArchive={(item) => setArchiveTarget(item)}
              />
            </TabsContent>
          ))}
        </Tabs>

        {/* 旧表格容器残留：已被 ScriptsTable 取代，保留分页元素的位置 */}
        <div className="hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">标题</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>标签</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-text-tertiary py-12"
                  >
                    加载中...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-text-tertiary py-12"
                  >
                    暂无话术
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const cfg = STATUS_MAP[item.status] ?? {
                    label: item.status,
                    variant: "secondary" as const,
                  };
                  const tagNames =
                    item.tags?.map((t) => t.name).filter(Boolean) ?? [];
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.title}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-text-tertiary">
                        {tagNames.length > 0 ? tagNames.join(" / ") : "—"}
                      </TableCell>
                      <TableCell className="text-text-tertiary">
                        {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(`/admin/scripts/${item.id}/edit`)
                          }
                        >
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={item.status !== "published"}
                          onClick={() => setArchiveTarget(item)}
                        >
                          归档
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </Button>
            <span className="text-sm text-text-secondary">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        )}
      </div>

      {/* 归档确认 */}
      <AlertDialog
        open={!!archiveTarget}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认归档？</AlertDialogTitle>
            <AlertDialogDescription>
              「{archiveTarget?.title}」将变为「已归档」状态，员工列表不再展示，
              且不可再次修改状态。该操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isArchiving}
              onClick={confirmArchive}
            >
              {isArchiving ? "归档中..." : "确认归档"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 从知识库生成（MVP 占位） */}
      <AlertDialog
        open={fromKnowledgeOpen}
        onOpenChange={setFromKnowledgeOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>从知识库生成</AlertDialogTitle>
            <AlertDialogDescription>
              MVP 阶段未启用 AI。Phase 2 将在此处选择知识切片并自动生成草稿话术。
              当前可在「新建话术」中手工录入，或在知识切片详情页点击「标记为精选」。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                toast.info("MVP 阶段未启用 AI，请在新建话术中手工录入");
                setFromKnowledgeOpen(false);
              }}
            >
              我知道了
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
