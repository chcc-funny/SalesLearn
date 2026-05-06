"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * 精选话术筛选组件（unit28）
 *
 * 受控组件：所有状态来自 props.value，用户操作通过 props.onChange 上抛新值。
 * 不可变更新：内部 toggleId 等返回新数组，绝不修改 props.value 内的引用。
 *
 * 设计原则：
 *  - 纯展示 + 受控；不持有内部 filter state（除非纯 UI 状态）
 *  - 标签按钮多选，再次点击取消；「全部」按钮清空当前 group
 *  - 排序使用原生 <select>（无需引入额外 popover），便于测试访问
 */

// ----------------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------------

export type ScriptFiltersTagGroup = "scene" | "product";

export interface ScriptFiltersTagOption {
  id: string;
  name: string;
  groupKey: ScriptFiltersTagGroup;
}

export type ScriptFiltersSortBy =
  | "updated_desc"
  | "created_desc"
  | "usage_desc";

export interface ScriptFiltersValue {
  q: string;
  sceneTagIds: string[];
  productTagIds: string[];
  sortBy: ScriptFiltersSortBy;
}

export interface ScriptFiltersProps {
  value: ScriptFiltersValue;
  sceneOptions: ScriptFiltersTagOption[];
  productOptions: ScriptFiltersTagOption[];
  onChange: (next: ScriptFiltersValue) => void;
  className?: string;
}

// ----------------------------------------------------------------------------
// 工具
// ----------------------------------------------------------------------------

function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id)
    ? list.filter((x) => x !== id)
    : [...list, id];
}

const SORT_OPTIONS: { value: ScriptFiltersSortBy; label: string }[] = [
  { value: "updated_desc", label: "最近更新" },
  { value: "created_desc", label: "最新创建" },
  { value: "usage_desc", label: "复制最多" },
];

// ----------------------------------------------------------------------------
// 子组件：标签按钮组
// ----------------------------------------------------------------------------

interface TagGroupProps {
  label: string;
  options: ScriptFiltersTagOption[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}

function TagGroup({
  label,
  options,
  selectedIds,
  onToggle,
  onClear,
}: TagGroupProps) {
  const isAllActive = selectedIds.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 shrink-0 text-xs font-medium text-text-secondary">
        {label}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-pressed={isAllActive}
        className={cn(
          "rounded-full border px-3 py-1 text-xs transition-colors",
          isAllActive
            ? "border-primary-500 bg-primary-50 text-primary-600"
            : "border-border bg-surface text-text-secondary hover:bg-primary-50/40"
        )}
      >
        全部
      </button>
      {options.map((opt) => {
        const isActive = selectedIds.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onToggle(opt.id)}
            aria-pressed={isActive}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              isActive
                ? "border-primary-500 bg-primary-50 text-primary-600"
                : "border-border bg-surface text-text-secondary hover:bg-primary-50/40"
            )}
          >
            {opt.name}
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 主组件
// ----------------------------------------------------------------------------

export function ScriptFilters({
  value,
  sceneOptions,
  productOptions,
  onChange,
  className,
}: ScriptFiltersProps) {
  function update(patch: Partial<ScriptFiltersValue>) {
    onChange({ ...value, ...patch });
  }

  function handleToggleScene(id: string) {
    update({ sceneTagIds: toggleId(value.sceneTagIds, id) });
  }
  function handleClearScene() {
    update({ sceneTagIds: [] });
  }
  function handleToggleProduct(id: string) {
    update({ productTagIds: toggleId(value.productTagIds, id) });
  }
  function handleClearProduct() {
    update({ productTagIds: [] });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-surface p-4",
        className
      )}
    >
      {/* 顶部：搜索 + 排序 */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={value.q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="搜索话术（标题或客户问题）"
          className="w-full sm:w-[280px]"
          aria-label="搜索话术"
        />
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          排序
          <select
            value={value.sortBy}
            onChange={(e) =>
              update({ sortBy: e.target.value as ScriptFiltersSortBy })
            }
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-text-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 场景标签 */}
      <TagGroup
        label="场景"
        options={sceneOptions}
        selectedIds={value.sceneTagIds}
        onToggle={handleToggleScene}
        onClear={handleClearScene}
      />

      {/* 产品标签 */}
      <TagGroup
        label="产品"
        options={productOptions}
        selectedIds={value.productTagIds}
        onToggle={handleToggleProduct}
        onClear={handleClearProduct}
      />
    </div>
  );
}

export default ScriptFilters;
