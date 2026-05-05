"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { InlineEditor } from "@/components/admin/knowledge/inline-editor";

interface KnowledgeDetail {
  id: string;
  title: string;
  category: string;
  keyPoints: string[];
  content: string;
  examples: string | null;
  commonMistakes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface DraftState {
  title: string;
  category: string;
  keyPointsText: string;
  content: string;
  examples: string;
  commonMistakes: string;
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

function toDraft(item: KnowledgeDetail): DraftState {
  return {
    title: item.title,
    category: item.category,
    keyPointsText: item.keyPoints.join("\n"),
    content: item.content,
    examples: item.examples ?? "",
    commonMistakes: item.commonMistakes ?? "",
  };
}

function buildPayload(draft: DraftState) {
  const keyPoints = draft.keyPointsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    title: draft.title,
    category: draft.category,
    keyPoints,
    content: draft.content,
    examples: draft.examples || null,
    commonMistakes: draft.commonMistakes || null,
  };
}

export default function KnowledgeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [original, setOriginal] = useState<KnowledgeDetail | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMarkingScript, setIsMarkingScript] = useState(false);
  const [error, setError] = useState("");

  // unit35：标记为精选话术
  // 调 POST /api/admin/scripts/from-knowledge（unit23）
  // 成功后 toast 含跳转链接到 /admin/scripts
  async function handleMarkAsScript() {
    if (!params.id || isMarkingScript) return;
    setIsMarkingScript(true);
    try {
      const res = await fetch("/api/admin/scripts/from-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeId: params.id }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "标记为精选话术失败");
        return;
      }
      toast.success("已生成 draft 话术", {
        description: "去『精选话术』管理 →",
        action: {
          label: "前往管理",
          onClick: () => router.push("/admin/scripts"),
        },
      });
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsMarkingScript(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch(`/api/knowledge/${params.id}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.success) {
          setOriginal(json.data);
          setDraft(toDraft(json.data));
        } else {
          setError(json.error ?? "加载失败");
        }
      } catch {
        if (!cancelled) setError("加载失败");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const dirty = useMemo(() => {
    if (!original || !draft) return false;
    return JSON.stringify(toDraft(original)) !== JSON.stringify(draft);
  }, [original, draft]);

  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  async function handleSave(extra?: { status?: "draft" | "published" }) {
    if (!draft || !original) return;
    setIsSaving(true);
    try {
      const payload = {
        ...buildPayload(draft),
        ...(extra?.status ? { status: extra.status } : {}),
      };
      const res = await fetch(`/api/knowledge/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "保存失败");
        return;
      }
      const updated = json.data as KnowledgeDetail;
      if (extra?.status === "draft") {
        toast.success("已驳回到草稿");
        router.push("/admin/knowledge");
        router.refresh();
        return;
      }
      setOriginal(updated);
      setDraft(toDraft(updated));
      toast.success(extra?.status === "published" ? "保存并发布成功" : "保存成功");
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-tertiary">加载中...</p>
      </div>
    );
  }

  if (error || !original || !draft) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-error">{error || "知识点不存在"}</p>
        <Button variant="outline" onClick={() => router.push("/admin/knowledge")}>
          返回列表
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[original.status] ?? STATUS_CONFIG.draft;

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-text-primary">知识点审核</h1>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={isMarkingScript || isSaving}
              onClick={handleMarkAsScript}
              aria-label="标记为精选话术"
            >
              {isMarkingScript ? "生成中..." : "标记为精选话术"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/admin/knowledge")}>
              返回列表
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border bg-surface p-6 space-y-5">
            <InlineEditor
              label="标题"
              value={draft.title}
              onChange={(v) => setDraft({ ...draft, title: v })}
              placeholder="知识点标题"
              disabled={isSaving}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">分类</label>
              <Select
                value={draft.category}
                onValueChange={(v) => setDraft({ ...draft, category: v })}
                disabled={isSaving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-text-tertiary">
                当前：{CATEGORY_LABELS[draft.category] ?? draft.category}
              </p>
            </div>

            <InlineEditor
              label="核心要点（每行一个）"
              multiline
              rows={4}
              value={draft.keyPointsText}
              onChange={(v) => setDraft({ ...draft, keyPointsText: v })}
              placeholder={"要点1\n要点2"}
              disabled={isSaving}
            />

            <InlineEditor
              label="详细内容"
              multiline
              rows={8}
              value={draft.content}
              onChange={(v) => setDraft({ ...draft, content: v })}
              placeholder="详细内容"
              disabled={isSaving}
            />

            <InlineEditor
              label="案例话术"
              multiline
              rows={4}
              value={draft.examples}
              onChange={(v) => setDraft({ ...draft, examples: v })}
              placeholder="客户问：...\n回答：..."
              disabled={isSaving}
            />

            <InlineEditor
              label="常见错误"
              multiline
              rows={3}
              value={draft.commonMistakes}
              onChange={(v) => setDraft({ ...draft, commonMistakes: v })}
              placeholder="误区1：..."
              disabled={isSaving}
            />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-surface px-6 py-4 shadow-[0_-1px_8px_rgba(0,0,0,0.04)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="text-sm">
            {dirty ? (
              <span className="text-warning">有未保存修改</span>
            ) : (
              <span className="text-text-tertiary">无未保存修改</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!dirty || isSaving}
              onClick={() => setDraft(toDraft(original))}
            >
              取消
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isSaving}>
                  驳回
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认驳回？</AlertDialogTitle>
                  <AlertDialogDescription>
                    将状态改为「草稿」，并保留当前修改。操作后会返回列表。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleSave({ status: "draft" })}>
                    确认驳回
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              variant="outline"
              disabled={!dirty || isSaving}
              onClick={() => handleSave()}
            >
              保存
            </Button>

            <Button
              className="bg-primary-500 hover:bg-primary-600"
              disabled={isSaving}
              onClick={() => handleSave({ status: "published" })}
            >
              {isSaving ? "处理中..." : "保存并发布"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
