"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/**
 * 管理端审核面板组件（unit48）
 *
 * 设计：
 *  - 受控展示组件：scripts 由父页面传入（pending_review 列表），增删改通过回调上抛
 *  - 双栏布局：左侧列表（标题/客户问题摘要）+ 右侧详情视图（可编辑 + 通过/驳回）
 *  - 编辑：title / customerQuestion / answer 三字段（沿用 ScriptForm 风格的 zod 兜底校验）
 *  - 通过：onApprove(id, edits) — edits 是当前 form 全字段（父页面再决定是否传 review API）
 *  - 驳回：行内弹 reject reason 输入，确认后 onReject(id, reason)
 *  - a11y：role="region" + role="form" + aria-label / aria-pressed / aria-invalid
 *  - 不可变：edits 在内部独立 state，不修改 props.scripts
 */

// ----------------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------------

export interface ReviewPanelTag {
  id: string;
  name: string;
  groupKey: "scene" | "product";
}

export interface ReviewPanelScript {
  id: string;
  title: string;
  customerQuestion: string;
  answer: string;
  status: "pending_review";
  source: string;
  createdAt: string;
  sceneTagIds?: string[];
  productTagIds?: string[];
  tags?: ReviewPanelTag[];
}

export interface ReviewPanelEdits {
  title: string;
  customerQuestion: string;
  answer: string;
  sceneTagIds: string[];
  productTagIds: string[];
}

export interface ReviewPanelProps {
  scripts: ReviewPanelScript[];
  onApprove: (id: string, edits: ReviewPanelEdits) => void | Promise<void>;
  onReject: (id: string, reason: string) => void | Promise<void>;
  isLoading?: boolean;
  isSubmitting?: boolean;
  className?: string;
}

// ----------------------------------------------------------------------------
// 工具
// ----------------------------------------------------------------------------

function deriveEdits(script: ReviewPanelScript): ReviewPanelEdits {
  return {
    title: script.title,
    customerQuestion: script.customerQuestion,
    answer: script.answer,
    sceneTagIds: script.sceneTagIds ? [...script.sceneTagIds] : [],
    productTagIds: script.productTagIds ? [...script.productTagIds] : [],
  };
}

function validateEdits(edits: ReviewPanelEdits): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!edits.title.trim()) {
    errs.title = "标题不能为空";
  } else if (edits.title.length > 200) {
    errs.title = "标题不能超过200个字符";
  }
  if (!edits.customerQuestion.trim()) {
    errs.customerQuestion = "客户问题不能为空";
  } else if (edits.customerQuestion.length > 2000) {
    errs.customerQuestion = "客户问题不能超过2000个字符";
  }
  if (!edits.answer.trim()) {
    errs.answer = "答案不能为空";
  } else if (edits.answer.length > 10000) {
    errs.answer = "答案不能超过10000个字符";
  }
  return errs;
}

// ----------------------------------------------------------------------------
// 组件
// ----------------------------------------------------------------------------

export function ReviewPanel({
  scripts,
  onApprove,
  onReject,
  isLoading = false,
  isSubmitting = false,
  className,
}: ReviewPanelProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [edits, setEdits] = React.useState<ReviewPanelEdits | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [rejectMode, setRejectMode] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [rejectError, setRejectError] = React.useState<string | null>(null);

  const selected = React.useMemo(
    () => scripts.find((s) => s.id === selectedId) ?? null,
    [scripts, selectedId]
  );

  // 选中项不在最新 scripts 时清空（如审核通过后从列表移除）
  React.useEffect(() => {
    if (selectedId && !scripts.some((s) => s.id === selectedId)) {
      setSelectedId(null);
      setEdits(null);
      setErrors({});
      setRejectMode(false);
      setRejectReason("");
      setRejectError(null);
    }
  }, [scripts, selectedId]);

  function handleSelect(script: ReviewPanelScript) {
    setSelectedId(script.id);
    setEdits(deriveEdits(script));
    setErrors({});
    setRejectMode(false);
    setRejectReason("");
    setRejectError(null);
  }

  function updateEdit<K extends keyof ReviewPanelEdits>(
    key: K,
    value: ReviewPanelEdits[K]
  ) {
    setEdits((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleApprove() {
    if (!selected || !edits) return;
    const errs = validateEdits(edits);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    await onApprove(selected.id, edits);
  }

  function openReject() {
    setRejectMode(true);
    setRejectReason("");
    setRejectError(null);
  }

  function cancelReject() {
    setRejectMode(false);
    setRejectReason("");
    setRejectError(null);
  }

  async function handleConfirmReject() {
    if (!selected) return;
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      setRejectError("拒绝原因不能为空");
      return;
    }
    if (trimmed.length > 500) {
      setRejectError("拒绝原因不能超过500个字符");
      return;
    }
    await onReject(selected.id, trimmed);
  }

  // ------------------------------------------------------------------
  // 渲染
  // ------------------------------------------------------------------
  const submitting = !!isSubmitting;
  const approveLabel = submitting ? "通过中..." : "通过";
  const rejectConfirmLabel = submitting ? "驳回中..." : "确认驳回";

  return (
    <section
      role="region"
      aria-label="待审核话术"
      className={cn(
        "grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]",
        className
      )}
    >
      {/* 列表 */}
      <aside className="rounded-lg border bg-surface" aria-label="待审核列表">
        <div className="border-b p-3 text-sm font-medium text-text-primary">
          待审核（{scripts.length}）
        </div>
        {isLoading ? (
          <div className="p-6 text-center text-sm text-text-tertiary">
            加载中...
          </div>
        ) : scripts.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-tertiary">
            暂无待审核话术
          </div>
        ) : (
          <ul className="divide-y">
            {scripts.map((script) => {
              const active = script.id === selectedId;
              return (
                <li key={script.id}>
                  <button
                    type="button"
                    role="button"
                    aria-pressed={active}
                    aria-label={`选择话术「${script.title}」`}
                    onClick={() => handleSelect(script)}
                    className={cn(
                      "block w-full px-3 py-3 text-left transition-colors hover:bg-primary-50/40",
                      active && "bg-primary-50 ring-1 ring-primary-500"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        data-testid="review-row-title"
                        className="line-clamp-1 text-sm font-medium text-text-primary"
                      >
                        {script.title}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        待审核
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-text-tertiary">
                      {script.customerQuestion}
                    </p>
                    <p className="mt-1 text-[11px] text-text-tertiary">
                      来源 {script.source}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* 详情 */}
      <div className="rounded-lg border bg-surface p-4">
        {!selected || !edits ? (
          <div
            className="flex min-h-[240px] items-center justify-center text-sm text-text-tertiary"
            role="status"
          >
            请从左侧选择一条待审核话术
          </div>
        ) : (
          <form
            role="form"
            aria-label="审核编辑"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleApprove();
            }}
            noValidate
          >
            {/* 标题 */}
            <div className="space-y-1">
              <Label htmlFor="review-title">标题</Label>
              <Input
                id="review-title"
                value={edits.title}
                onChange={(e) => updateEdit("title", e.target.value)}
                disabled={submitting}
                aria-invalid={!!errors.title}
                aria-describedby={
                  errors.title ? "review-title-error" : undefined
                }
                maxLength={200}
              />
              {errors.title ? (
                <p
                  id="review-title-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {errors.title}
                </p>
              ) : null}
            </div>

            {/* 客户问题 */}
            <div className="space-y-1">
              <Label htmlFor="review-customer-question">客户问题</Label>
              <Textarea
                id="review-customer-question"
                value={edits.customerQuestion}
                onChange={(e) =>
                  updateEdit("customerQuestion", e.target.value)
                }
                rows={3}
                disabled={submitting}
                aria-invalid={!!errors.customerQuestion}
                aria-describedby={
                  errors.customerQuestion ? "review-cq-error" : undefined
                }
              />
              {errors.customerQuestion ? (
                <p
                  id="review-cq-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {errors.customerQuestion}
                </p>
              ) : null}
            </div>

            {/* 答案 */}
            <div className="space-y-1">
              <Label htmlFor="review-answer">答案</Label>
              <Textarea
                id="review-answer"
                value={edits.answer}
                onChange={(e) => updateEdit("answer", e.target.value)}
                rows={6}
                disabled={submitting}
                aria-invalid={!!errors.answer}
                aria-describedby={
                  errors.answer ? "review-answer-error" : undefined
                }
              />
              {errors.answer ? (
                <p
                  id="review-answer-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {errors.answer}
                </p>
              ) : null}
            </div>

            {/* 标签只读展示（编辑标签不在 v1 范围；保持最小） */}
            {selected.tags && selected.tags.length > 0 ? (
              <div className="space-y-1">
                <span className="text-sm font-medium text-text-primary">
                  标签
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.map((t) => (
                    <Badge key={t.id} variant="secondary" className="text-xs">
                      {t.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 操作区 */}
            {!rejectMode ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-primary-500 hover:bg-primary-600"
                >
                  {approveLabel}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={openReject}
                >
                  驳回
                </Button>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <Label htmlFor="review-reject-reason">拒绝原因</Label>
                <Textarea
                  id="review-reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="请说明驳回原因（≤500 字）"
                  disabled={submitting}
                  aria-invalid={!!rejectError}
                  aria-describedby={
                    rejectError ? "review-reject-error" : undefined
                  }
                  maxLength={500}
                />
                {rejectError ? (
                  <p
                    id="review-reject-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {rejectError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={submitting}
                    onClick={() => void handleConfirmReject()}
                  >
                    {rejectConfirmLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={cancelReject}
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

export default ReviewPanel;
