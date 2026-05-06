"use client";

import * as React from "react";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * 精选话术卡片（unit27）
 *
 * 纯展示组件：不调 API，所有副作用通过 props 回调上抛。
 * 员工端 / 管理端共享渲染骨架；通过 `showStatusBadge` 切换徽章可见性。
 *
 * 设计原则：
 *  - props 不可变；标签数组等结构内部不做修改
 *  - 复制按钮通过 onCopy(script) 上抛，调用方自行触发 API + toast
 *  - status 徽章独立配置（员工端默认隐藏 published 徽章，管理端显示完整状态）
 */

// ----------------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------------

export type ScriptCardStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "rejected"
  | "archived";

export type ScriptCardTagGroup = "scene" | "product";

export interface ScriptCardTag {
  id: string;
  name: string;
  groupKey: ScriptCardTagGroup;
}

export interface ScriptCardData {
  id: string;
  title: string;
  customerQuestion: string;
  answer: string;
  status: ScriptCardStatus;
  usageCount: number;
  tags: ScriptCardTag[];
}

export interface ScriptCardProps {
  /** 话术数据（含标签） */
  script: ScriptCardData;
  /** 复制按钮点击回调；不传也不会抛错 */
  onCopy?: (script: ScriptCardData) => void;
  /** 是否禁用复制按钮（如登录态过期或限流时） */
  disabled?: boolean;
  /** 是否展示状态徽章；员工端默认隐藏（仅 published 入列表），管理端打开 */
  showStatusBadge?: boolean;
  /** 额外 className 透传给根容器 */
  className?: string;
}

// ----------------------------------------------------------------------------
// 状态徽章映射
// ----------------------------------------------------------------------------

const STATUS_LABELS: Readonly<Record<ScriptCardStatus, string>> = {
  draft: "草稿",
  pending_review: "待审核",
  published: "已发布",
  rejected: "已拒绝",
  archived: "已归档",
};

const STATUS_VARIANTS: Readonly<
  Record<ScriptCardStatus, "default" | "secondary" | "destructive" | "outline">
> = {
  draft: "secondary",
  pending_review: "outline",
  published: "default",
  rejected: "destructive",
  archived: "secondary",
};

// ----------------------------------------------------------------------------
// 组件
// ----------------------------------------------------------------------------

export function ScriptCard({
  script,
  onCopy,
  disabled = false,
  showStatusBadge = false,
  className,
}: ScriptCardProps) {
  const sceneTags = script.tags.filter((t) => t.groupKey === "scene");
  const productTags = script.tags.filter((t) => t.groupKey === "product");
  const hasAnyTag = sceneTags.length > 0 || productTags.length > 0;

  function handleCopy() {
    if (disabled) return;
    onCopy?.(script);
  }

  return (
    <Card
      role="article"
      aria-labelledby={`script-card-title-${script.id}`}
      className={cn(
        "flex flex-col gap-3 p-4 transition-shadow hover:shadow-md",
        className
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 p-0">
        <CardTitle
          id={`script-card-title-${script.id}`}
          className="text-base font-semibold leading-snug line-clamp-2"
        >
          {script.title}
        </CardTitle>
        {showStatusBadge ? (
          <Badge variant={STATUS_VARIANTS[script.status]} className="shrink-0">
            {STATUS_LABELS[script.status]}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-2 p-0">
        <p className="text-sm text-muted-foreground line-clamp-2">
          <span className="font-medium text-foreground/80">客户问题：</span>
          {script.customerQuestion}
        </p>
        <p className="text-sm text-foreground/90 line-clamp-3">
          {script.answer}
        </p>
      </CardContent>

      {hasAnyTag ? (
        <div className="flex flex-wrap gap-1.5">
          {sceneTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              className="text-xs font-normal"
            >
              {tag.name}
            </Badge>
          ))}
          {productTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="text-xs font-normal"
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      ) : null}

      <CardFooter className="flex items-center justify-between p-0 pt-1">
        <span className="text-xs text-muted-foreground">
          已被复制 {script.usageCount} 次
        </span>
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={handleCopy}
          disabled={disabled}
          aria-label={`复制话术「${script.title}」`}
        >
          <Copy aria-hidden="true" />
          复制
        </Button>
      </CardFooter>
    </Card>
  );
}

export default ScriptCard;
