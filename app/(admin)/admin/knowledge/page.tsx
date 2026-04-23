"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "草稿", variant: "secondary" },
  reviewing: { label: "审核中", variant: "outline" },
  published: { label: "已发布", variant: "default" },
};

export default function KnowledgeListPage() {
  const router = useRouter();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const limit = 20;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);

      const res = await fetch(`/api/knowledge?${params}`);
      const json: PaginatedResponse = await res.json();

      if (json.success) {
        setItems(json.data);
        setTotal(json.meta.total);
      }
    } catch {
      // 静默处理
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, categoryFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / limit);

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

        {/* 筛选栏 */}
        <div className="mb-4 flex gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
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

          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="分类筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              <SelectItem value="product">产品知识</SelectItem>
              <SelectItem value="objection">客户异议</SelectItem>
              <SelectItem value="closing">成交话术</SelectItem>
              <SelectItem value="psychology">客户心理</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 表格 */}
        <div className="rounded-lg border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={5} className="text-center text-text-tertiary py-12">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-text-tertiary py-12">
                    暂无知识点
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.draft;
                  return (
                    <TableRow key={item.id}>
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
    </div>
  );
}
