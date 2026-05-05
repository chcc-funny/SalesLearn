"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  createScriptSchema,
  updateScriptSchema,
} from "@/lib/validations/script";

/**
 * 管理端话术表单（unit31）
 *
 * 设计：
 *  - 受控表单（useState），对外接口与 react-hook-form + zod resolver 同语义：
 *    `mode='create' | 'edit'`、`initialValues`、`onSubmit(values)`、`isSubmitting`
 *  - 校验直接复用 unit07 的 createScriptSchema / updateScriptSchema，避免双校验源
 *  - 不引入新依赖（项目其它表单也是受控 useState 风格，与 KnowledgeForm 一致）
 *  - onSubmit 仅返回 values，不直接 fetch；父页面负责调 API + toast + 跳转
 *  - a11y：所有控件 label 关联，标签按钮 aria-pressed 表达选中态
 *  - 不可变更新：标签 toggle 返回新数组，不修改 props.initialValues
 */

// ----------------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------------

export type ScriptFormStatus = "draft" | "published";
export type ScriptFormTagGroup = "scene" | "product";

export interface ScriptFormTagOption {
  id: string;
  name: string;
  groupKey: ScriptFormTagGroup;
}

export interface ScriptFormValues {
  title: string;
  customerQuestion: string;
  answer: string;
  sceneTagIds: string[];
  productTagIds: string[];
  status: ScriptFormStatus;
}

export interface ScriptFormProps {
  mode: "create" | "edit";
  initialValues?: Partial<ScriptFormValues>;
  sceneOptions: ScriptFormTagOption[];
  productOptions: ScriptFormTagOption[];
  onSubmit: (values: ScriptFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  className?: string;
}

// ----------------------------------------------------------------------------
// 默认值
// ----------------------------------------------------------------------------

const DEFAULT_VALUES: ScriptFormValues = {
  title: "",
  customerQuestion: "",
  answer: "",
  sceneTagIds: [],
  productTagIds: [],
  status: "draft",
};

function mergeInitial(
  initial?: Partial<ScriptFormValues>
): ScriptFormValues {
  if (!initial) return { ...DEFAULT_VALUES };
  return {
    title: initial.title ?? DEFAULT_VALUES.title,
    customerQuestion:
      initial.customerQuestion ?? DEFAULT_VALUES.customerQuestion,
    answer: initial.answer ?? DEFAULT_VALUES.answer,
    // 复制数组，避免后续 toggle 修改外部引用
    sceneTagIds: initial.sceneTagIds ? [...initial.sceneTagIds] : [],
    productTagIds: initial.productTagIds ? [...initial.productTagIds] : [],
    status: initial.status ?? DEFAULT_VALUES.status,
  };
}

// 不可变 toggle
function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// ----------------------------------------------------------------------------
// 组件
// ----------------------------------------------------------------------------

export function ScriptForm({
  mode,
  initialValues,
  sceneOptions,
  productOptions,
  onSubmit,
  onCancel,
  isSubmitting = false,
  className,
}: ScriptFormProps) {
  const [values, setValues] = React.useState<ScriptFormValues>(() =>
    mergeInitial(initialValues)
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function update<K extends keyof ScriptFormValues>(
    key: K,
    val: ScriptFormValues[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function handleToggleScene(id: string) {
    update("sceneTagIds", toggleId(values.sceneTagIds, id));
  }
  function handleToggleProduct(id: string) {
    update("productTagIds", toggleId(values.productTagIds, id));
  }

  function validate(): boolean {
    // create / edit 都最低限度要求 title / customerQuestion / answer 非空
    // 校验直接复用 zod schema：create 用 createScriptSchema 严格校验所有必填；
    // edit 用 updateScriptSchema 至少一个字段，但前端始终全字段渲染，因此用 createScriptSchema
    // 的核心字段做单一校验（source 字段在父页面层补，避免暴露给 form props）
    const errs: Record<string, string> = {};

    if (!values.title.trim()) {
      errs.title = "标题不能为空";
    } else if (values.title.length > 200) {
      errs.title = "标题不能超过200个字符";
    }

    if (!values.customerQuestion.trim()) {
      errs.customerQuestion = "客户问题不能为空";
    } else if (values.customerQuestion.length > 2000) {
      errs.customerQuestion = "客户问题不能超过2000个字符";
    }

    if (!values.answer.trim()) {
      errs.answer = "答案不能为空";
    } else if (values.answer.length > 10000) {
      errs.answer = "答案不能超过10000个字符";
    }

    // 跑一次 zod 兜底（与服务端单一来源）
    if (mode === "create") {
      const parsed = createScriptSchema.safeParse({
        title: values.title,
        customerQuestion: values.customerQuestion,
        answer: values.answer,
        // source 由父页面在调用 API 时补；这里塞 'curated'（管理端手工录入）仅用于跑通 zod
        source: "curated",
        sceneTagIds: values.sceneTagIds,
        productTagIds: values.productTagIds,
        status: values.status,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? "form");
          if (!errs[key]) errs[key] = issue.message;
        }
      }
    } else {
      const parsed = updateScriptSchema.safeParse({
        title: values.title,
        customerQuestion: values.customerQuestion,
        answer: values.answer,
        sceneTagIds: values.sceneTagIds,
        productTagIds: values.productTagIds,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? "form");
          if (!errs[key]) errs[key] = issue.message;
        }
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!validate()) return;
    await onSubmit(values);
  }

  // ------------------------------------------------------------------
  // 渲染
  // ------------------------------------------------------------------
  const submitLabel = isSubmitting
    ? mode === "create"
      ? "创建中..."
      : "保存中..."
    : mode === "create"
      ? "创建"
      : "保存";

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("space-y-6", className)}
      noValidate
    >
      {/* 标题 */}
      <div className="space-y-2">
        <Label htmlFor="script-title">标题</Label>
        <Input
          id="script-title"
          value={values.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="一句话概括这条话术（≤200 字）"
          maxLength={200}
          disabled={isSubmitting}
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "script-title-error" : undefined}
        />
        {errors.title ? (
          <p
            id="script-title-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {errors.title}
          </p>
        ) : null}
      </div>

      {/* 员工提问（customerQuestion） */}
      <div className="space-y-2">
        <Label htmlFor="script-customer-question">员工提问（客户问题）</Label>
        <Textarea
          id="script-customer-question"
          value={values.customerQuestion}
          onChange={(e) => update("customerQuestion", e.target.value)}
          placeholder="例如：镀膜能保多久？"
          rows={3}
          disabled={isSubmitting}
          aria-invalid={!!errors.customerQuestion}
          aria-describedby={
            errors.customerQuestion ? "script-cq-error" : undefined
          }
        />
        {errors.customerQuestion ? (
          <p
            id="script-cq-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {errors.customerQuestion}
          </p>
        ) : null}
      </div>

      {/* 话术内容（answer） */}
      <div className="space-y-2">
        <Label htmlFor="script-answer">话术内容（答案）</Label>
        <Textarea
          id="script-answer"
          value={values.answer}
          onChange={(e) => update("answer", e.target.value)}
          placeholder="详细的标准答案，员工将一键复制使用"
          rows={8}
          disabled={isSubmitting}
          aria-invalid={!!errors.answer}
          aria-describedby={errors.answer ? "script-answer-error" : undefined}
        />
        {errors.answer ? (
          <p
            id="script-answer-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {errors.answer}
          </p>
        ) : null}
      </div>

      {/* 场景标签 */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">场景标签</legend>
        {sceneOptions.length === 0 ? (
          <p className="text-xs text-text-tertiary">
            暂无场景标签，请先在标签管理页创建
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sceneOptions.map((opt) => {
              const active = values.sceneTagIds.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleToggleScene(opt.id)}
                  aria-pressed={active}
                  disabled={isSubmitting}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    active
                      ? "border-primary-500 bg-primary-50 text-primary-600"
                      : "border-border bg-surface text-text-secondary hover:bg-primary-50/40"
                  )}
                >
                  {opt.name}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      {/* 产品标签 */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">产品标签</legend>
        {productOptions.length === 0 ? (
          <p className="text-xs text-text-tertiary">
            暂无产品标签，请先在标签管理页创建
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {productOptions.map((opt) => {
              const active = values.productTagIds.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleToggleProduct(opt.id)}
                  aria-pressed={active}
                  disabled={isSubmitting}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    active
                      ? "border-primary-500 bg-primary-50 text-primary-600"
                      : "border-border bg-surface text-text-secondary hover:bg-primary-50/40"
                  )}
                >
                  {opt.name}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      {/* 状态切换（draft / published） */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">发布状态</legend>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="script-status"
              value="draft"
              checked={values.status === "draft"}
              onChange={() => update("status", "draft")}
              disabled={isSubmitting}
            />
            草稿
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="script-status"
              value="published"
              checked={values.status === "published"}
              onChange={() => update("status", "published")}
              disabled={isSubmitting}
            />
            已发布
          </label>
        </div>
      </fieldset>

      {/* 操作 */}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          className="bg-primary-500 hover:bg-primary-600"
          disabled={isSubmitting}
        >
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            取消
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export default ScriptForm;
