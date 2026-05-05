"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDebounce } from "@/hooks/use-debounce";

interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
  status: string;
  createdAt: string;
}

interface PaginatedResponse {
  success: boolean;
  data: KnowledgeItem[];
  meta: { total: number; page: number; limit: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  product: "产品知识",
  objection: "客户异议",
  closing: "成交话术",
  psychology: "客户心理",
};

const CATEGORY_OPTIONS = [
  { value: "product", label: "产品知识" },
  { value: "objection", label: "客户异议" },
  { value: "closing", label: "成交话术" },
  { value: "psychology", label: "客户心理" },
];

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft: { label: "草稿", variant: "secondary" },
  reviewing: { label: "审核中", variant: "outline" },
  published: { label: "已发布", variant: "default" },
};

type BatchAction =
  | { action: "publish"; ids: string[] }
  | { action: "delete"; ids: string[] }
  | { action: "setCategory"; ids: string[]; category: string };

export default function KnowledgeListPage() {
  const router = useRouter();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText, 300);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [isBatching, setIsBatching] = useState(false);
  const limit = 20;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, categoryFilter]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (debouncedSearch) params.set("q", debouncedSearch);

      const res = await fetch(`/api/knowledge?${params}`);
      const json: PaginatedResponse = await res.json();

      if (json.success) {
        setItems(json.data);
        setTotal(json.meta.total);
      }
    } catch {
      toast.error("加载列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, categoryFilter, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 翻页或筛选变化时清空选择
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, debouncedSearch, statusFilter, categoryFilter]);

  const totalPages = Math.ceil(total / limit);

  const allSelectedOnPage = useMemo(
    () => items.length > 0 && items.every((it) => selectedIds.has(it.id)),
    [items, selectedIds]
  );
  const someSelectedOnPage = useMemo(
    () =>
      items.some((it) => selectedIds.has(it.id)) && !allSelectedOnPage,
    [items, selectedIds, allSelectedOnPage]
  );
  const headerCheckedState: boolean | "indeterminate" = allSelectedOnPage
    ? true
    : someSelectedOnPage
      ? "indeterminate"
      : false;

  function toggleSelectAllPage(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        items.forEach((it) => next.add(it.id));
      } else {
        items.forEach((it) => next.delete(it.id));
      }
      return next;
    });
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runBatch(payload: BatchAction): Promise<boolean> {
    setIsBatching(true);
    try {
      const res = await fetch("/api/knowledge/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "批量操作失败");
        return false;
      }
      toast.success(`操作成功：${json.data.affected} 个知识点`);
      setSelectedIds(new Set());
      await fetchData();
      return true;
    } catch {
      toast.error("批量操作失败");
      return false;
    } finally {
      setIsBatching(false);
    }
  }

  async function handleBatchPublish() {
    await runBatch({ action: "publish", ids: Array.from(selectedIds) });
    setConfirmPublishOpen(false);
  }

  async function handleBatchDelete() {
    await runBatch({ action: "delete", ids: Array.from(selectedIds) });
    setConfirmDeleteOpen(false);
  }

  async function handleBatchSetCategory(category: string) {
    await runBatch({
      action: "setCategory",
      ids: Array.from(selectedIds),
      category,
    });
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">知识库管理</h1>
            <p className="text-sm text-text-secondary">共 {total} 个知识点</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/admin")}>
              返回管理后台
            </Button>
            <Button
              className="bg-primary-500 hover:bg-primary-600"
              onClick={() => router.push("/admin/knowledge/upload")}
            >
              上传资料
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索标题..."
            className="w-[260px]"
          />

          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
              <SelectItem value="reviewing">审核中</SelectItem>
              <SelectItem value="published">已发布</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="分类筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedIds.size > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-md border bg-surface px-4 py-3">
            <div className="text-sm text-text-secondary">
              已选 {selectedIds.size} 项
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isBatching}
                onClick={() => setConfirmPublishOpen(true)}
              >
                批量发布
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={isBatching}>
                    批量改分类
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <DropdownMenuItem
                      key={c.value}
                      onClick={() => handleBatchSetCategory(c.value)}
                    >
                      {c.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                size="sm"
                variant="destructive"
                disabled={isBatching}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                批量删除
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isBatching}
                onClick={() => setSelectedIds(new Set())}
              >
                取消选择
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={headerCheckedState}
                    onCheckedChange={(v) => toggleSelectAllPage(Boolean(v))}
                    aria-label="全选当前页"
                  />
                </TableHead>
                <TableHead className="w-[40%]">标题</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-text-tertiary py-12">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-text-tertiary py-12">
                    暂无知识点
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.draft;
                  const checked = selectedIds.has(item.id);
                  return (
                    <TableRow key={item.id} data-state={checked ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleRow(item.id, Boolean(v))}
                          aria-label={`选择 ${item.title}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>{CATEGORY_LABELS[item.category] ?? item.category}</TableCell>
                      <TableCell>
                        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-text-tertiary">
                        {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/admin/knowledge/${item.id}`)}
                        >
                          查看
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

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

      <AlertDialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <AlertDialogTrigger asChild>
          <span className="hidden" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量发布？</AlertDialogTitle>
            <AlertDialogDescription>
              共 {selectedIds.size} 个知识点将变更为「已发布」状态，员工将立即可见。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBatching}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={isBatching} onClick={handleBatchPublish}>
              确认发布
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogTrigger asChild>
          <span className="hidden" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除？</AlertDialogTitle>
            <AlertDialogDescription>
              共 {selectedIds.size} 个知识点将被永久删除，操作不可恢复。
              已被引用的知识点（关联习题/学习记录）会删除失败。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBatching}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBatching}
              onClick={handleBatchDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
