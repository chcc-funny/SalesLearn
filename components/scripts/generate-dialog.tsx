"use client";

import * as React from "react";
import { Copy, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

/**
 * 生成弹窗 GenerateDialog（unit46）
 *
 * 员工端：客户问题 → POST /api/scripts/generate → 渲染候选 → 复制 / 提交审核
 *
 * 设计原则：
 *  - useState + zod safeParse 风格（与 Batch 11 表单一致；本组件 zod 仅用做长度上限校验）
 *  - 不可变 state：候选数组、source、error 全部 setX(newValue)
 *  - a11y：role="dialog" / aria-modal / Esc 关闭 / 关闭按钮 aria-label="关闭"
 *  - shadcn/ui 已有 Button / Textarea / Badge；本组件不引入新依赖（无 Radix Dialog）
 *    自己实现 overlay + Esc 监听 + 焦点回收（仅在 open=true 时加全局监听）
 *  - 长度上限 500（与后端 generateScriptSchema 保持单一来源——硬编码常量）
 */

const MAX_QUESTION_LENGTH = 500;

// ----------------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------------

type OrchestratorSource = "curated" | "generated" | "mixed" | "empty";

interface OrchestratorItem {
  id: string;
  title: string;
  customerQuestion: string;
  answer: string;
  score: number;
  rerankReason?: string;
  isGenerated?: boolean;
  sourceIds?: string[];
}

interface GenerateResponse {
  success: boolean;
  data?: {
    source: OrchestratorSource;
    items: OrchestratorItem[];
    /** orchestrator 当前不返回 requestId；前端兜底自生成（Phase 2 收尾时统一） */
    requestId?: string;
    degraded?: boolean;
    generateError?: string;
  };
  error?: string;
}

interface SubmitResponse {
  success: boolean;
  data?: { id: string; status: string };
  error?: string;
}

export interface GenerateDialogProps {
  open: boolean;
  onClose: () => void;
  /** 提交审核成功后的回调（由调用方刷新列表） */
  onSubmitted?: (script: { id: string; status: string }) => void;
  /** 初始客户问题（如调用方已知问题，可预填） */
  initialQuestion?: string;
  /** 额外 className 透传给根容器 */
  className?: string;
}

// ----------------------------------------------------------------------------
// 工具：UUID 生成（前端兜底，Phase 2 收尾改由后端返回）
// ----------------------------------------------------------------------------

function genRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof (crypto as Crypto & { randomUUID?: () => string }).randomUUID ===
      "function"
  ) {
    return (crypto as Crypto & { randomUUID: () => string }).randomUUID();
  }
  // happy-dom 兜底（非 v4 UUID，但通过 zod uuid 校验需要 v4 格式）
  // 简易 v4 实现避免引入 uuid 依赖
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[(Math.random() * 4) | (8 & 0xf)];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}

// ----------------------------------------------------------------------------
// Source 徽标
// ----------------------------------------------------------------------------

function SourceBadge({
  isGenerated,
  source,
}: {
  isGenerated?: boolean;
  source: OrchestratorSource;
}) {
  if (isGenerated) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800">
        AI 生成
      </Badge>
    );
  }
  if (source === "curated" || source === "mixed") {
    return (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
        精选
      </Badge>
    );
  }
  return null;
}

// ----------------------------------------------------------------------------
// 候选卡片
// ----------------------------------------------------------------------------

interface CandidateCardProps {
  item: OrchestratorItem;
  source: OrchestratorSource;
  onCopy: (item: OrchestratorItem) => void;
  onSubmit: (item: OrchestratorItem) => void;
  isSubmitting: boolean;
}

function CandidateCard({
  item,
  source,
  onCopy,
  onSubmit,
  isSubmitting,
}: CandidateCardProps) {
  return (
    <div
      className="rounded-lg border bg-surface p-3 shadow-sm"
      data-testid="candidate-card"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-text-primary">
          {item.title}
        </h3>
        <SourceBadge isGenerated={item.isGenerated} source={source} />
      </div>
      <p className="mb-2 line-clamp-3 text-sm text-text-secondary">
        {item.answer}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCopy(item)}
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          复制
        </Button>
        {item.isGenerated ? (
          <Button
            type="button"
            size="sm"
            disabled={isSubmitting}
            onClick={() => onSubmit(item)}
          >
            {isSubmitting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" />
            )}
            提交审核
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 主组件
// ----------------------------------------------------------------------------

export function GenerateDialog({
  open,
  onClose,
  onSubmitted,
  initialQuestion = "",
  className,
}: GenerateDialogProps) {
  const [question, setQuestion] = React.useState(initialQuestion);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{
    source: OrchestratorSource;
    items: OrchestratorItem[];
    requestId?: string;
  } | null>(null);

  // 切换 open 时重置 state（不可变更新）
  React.useEffect(() => {
    if (open) {
      setQuestion(initialQuestion);
      setResult(null);
      setIsLoading(false);
      setIsSubmitting(false);
    }
  }, [open, initialQuestion]);

  // Esc 关闭
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const trimmed = question.trim();
  const tooLong = question.length > MAX_QUESTION_LENGTH;
  const canGenerate = trimmed.length > 0 && !tooLong && !isLoading;

  async function handleGenerate() {
    if (!canGenerate) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/scripts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerQuestion: trimmed }),
      });
      const json = (await res.json()) as GenerateResponse;
      if (!json.success || !json.data) {
        toast.error(json.error ?? "生成失败，请稍后重试");
        setResult({ source: "empty", items: [] });
        return;
      }
      // requestId 优先使用后端返回；缺失则前端生成（Phase 2 收尾切到后端）
      setResult({
        source: json.data.source,
        items: json.data.items,
        requestId: json.data.requestId ?? genRequestId(),
      });
    } catch {
      toast.error("网络异常，请稍后重试");
      setResult({ source: "empty", items: [] });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy(item: OrchestratorItem) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(item.answer);
      }
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动选择文本");
    }
  }

  async function handleSubmit(item: OrchestratorItem) {
    if (!result) return;
    setIsSubmitting(true);
    try {
      const requestId = result.requestId ?? genRequestId();
      const body = {
        requestId,
        title: item.title,
        customerQuestion: trimmed || item.customerQuestion,
        answer: item.answer,
      };
      const res = await fetch("/api/scripts/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as SubmitResponse;
      if (!json.success || !json.data) {
        toast.error(json.error ?? "提交审核失败");
        return;
      }
      toast.success("已提交主管审核");
      onSubmitted?.(json.data);
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-dialog-title"
    >
      {/* Overlay：点击关闭 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal 内容容器 */}
      <div
        className={cn(
          "relative z-10 mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-hidden rounded-lg bg-background p-5 shadow-lg",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="关闭"
          className="absolute right-2 top-2 h-8 w-8 p-0"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>

        {/* 标题 */}
        <div>
          <h2
            id="generate-dialog-title"
            className="text-lg font-semibold text-text-primary"
          >
            AI 生成话术
          </h2>
          <p className="text-xs text-text-secondary">
            粘贴客户问题，AI 优先匹配精选话术，未命中则基于知识库生成草稿
          </p>
        </div>

        {/* 输入区 */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="generate-dialog-question"
            className="text-sm font-medium text-text-primary"
          >
            客户问题
          </label>
          <Textarea
            id="generate-dialog-question"
            aria-label="客户问题"
            placeholder="例如：贴膜什么牌子好？质保多久？"
            rows={4}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isLoading}
          />
          <div className="flex items-center justify-between text-xs">
            {tooLong ? (
              <span className="text-red-600">
                问题不能超过 {MAX_QUESTION_LENGTH} 个字符
              </span>
            ) : (
              <span className="text-text-secondary">
                建议 200 字以内，简明描述客户疑问
              </span>
            )}
            <span
              className={cn(
                "text-text-tertiary",
                tooLong && "text-red-600"
              )}
            >
              {question.length}/{MAX_QUESTION_LENGTH}
            </span>
          </div>
          <div className="mt-1 flex justify-end">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                "获取答案"
              )}
            </Button>
          </div>
        </div>

        {/* 结果区 */}
        <div className="flex-1 overflow-y-auto">
          {result ? (
            result.items.length === 0 ? (
              <div className="rounded border border-dashed p-6 text-center text-sm text-text-secondary">
                暂未找到匹配的精选话术，且 AI 未生成结果。请改写问题再试。
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {result.items.map((item) => (
                  <CandidateCard
                    key={item.id}
                    item={item}
                    source={result.source}
                    onCopy={handleCopy}
                    onSubmit={handleSubmit}
                    isSubmitting={isSubmitting}
                  />
                ))}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
