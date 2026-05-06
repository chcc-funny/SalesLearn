"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ScriptCard, type ScriptCardData } from "./script-card";

/**
 * 精选话术列表组件（unit28）
 *
 * 三态渲染：loading / error / empty / data。
 * loading 优先级最高（即使有 error 也先显示 loading），符合「请求中重试不闪报错」的体验。
 * onCopy 透传给每张卡片，由调用方决定是否触发 API 调用。
 */

export interface ScriptListProps {
  scripts: ScriptCardData[];
  isLoading?: boolean;
  error?: string | null;
  emptyText?: string;
  onCopy?: (script: ScriptCardData) => void;
  /** 是否显示状态徽章（管理端通常需要） */
  showStatusBadge?: boolean;
  className?: string;
}

const DEFAULT_EMPTY_TEXT = "暂无话术，换个筛选条件试试";

export function ScriptList({
  scripts,
  isLoading = false,
  error = null,
  emptyText = DEFAULT_EMPTY_TEXT,
  onCopy,
  showStatusBadge = false,
  className,
}: ScriptListProps) {
  // 优先级：loading > error > empty > data
  if (isLoading) {
    return (
      <div
        className={cn(
          "flex min-h-[160px] items-center justify-center text-sm text-text-tertiary",
          className
        )}
      >
        加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className={cn(
          "flex min-h-[160px] items-center justify-center rounded-lg border border-destructive/40 bg-destructive/5 text-sm text-destructive",
          className
        )}
      >
        {error}
      </div>
    );
  }

  if (scripts.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-[160px] items-center justify-center text-sm text-text-tertiary",
          className
        )}
      >
        {emptyText}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {scripts.map((script) => (
        <ScriptCard
          key={script.id}
          script={script}
          onCopy={onCopy}
          showStatusBadge={showStatusBadge}
        />
      ))}
    </div>
  );
}

export default ScriptList;
