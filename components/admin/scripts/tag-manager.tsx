"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronUp, ChevronDown, Pencil, Trash2 } from "lucide-react";

/**
 * 管理端标签管理组件（unit34）
 *
 * 设计：
 *  - 受控展示组件：tags 由父页面传入；增删改/排序通过回调上抛给父页面，由父调用 API
 *  - 两栏：场景（scene） / 产品（product），按 sortOrder 升序展示
 *  - 操作：新建（每栏顶部）/ 行内编辑 / 软删 / 上移下移
 *  - 权限：依赖后端 manager-only 鉴权（403 由 fetch 上层 toast）；UI 不渲染额外检查
 *  - a11y：fieldset + legend 分组、按钮 aria-label 包含标签名、tag 文案 data-testid
 *  - 不可变更新：内部仅做读取与排序展示，不修改 props.tags
 *
 * 不引入新依赖（用现有 lucide-react / shadcn ui / hand-rolled state）。
 */

export type TagManagerGroupKey = "scene" | "product";

export interface TagManagerTag {
  id: string;
  name: string;
  groupKey: TagManagerGroupKey;
  sortOrder: number;
  isActive: boolean;
}

export interface TagManagerProps {
  tags: TagManagerTag[];
  onCreate: (groupKey: TagManagerGroupKey, name: string) => void | Promise<void>;
  onUpdate: (
    id: string,
    patch: { name: string }
  ) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onMove: (
    groupKey: TagManagerGroupKey,
    id: string,
    direction: "up" | "down"
  ) => void | Promise<void>;
  isLoading?: boolean;
  className?: string;
}

interface CreateState {
  groupKey: TagManagerGroupKey;
  name: string;
}

const GROUP_LABEL: Record<TagManagerGroupKey, string> = {
  scene: "场景标签",
  product: "产品标签",
};

const GROUP_EMPTY: Record<TagManagerGroupKey, string> = {
  scene: "暂无场景标签",
  product: "暂无产品标签",
};

function sortByOrder(tags: TagManagerTag[]): TagManagerTag[] {
  // 不可变排序：返回新数组
  return [...tags].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

export function TagManager({
  tags,
  onCreate,
  onUpdate,
  onDelete,
  onMove,
  isLoading = false,
  className,
}: TagManagerProps) {
  const [creating, setCreating] = React.useState<CreateState | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState<string>("");

  // 按 group 拆分 + 排序（不修改 props.tags）
  const grouped = React.useMemo(() => {
    const sceneList = sortByOrder(tags.filter((t) => t.groupKey === "scene"));
    const productList = sortByOrder(
      tags.filter((t) => t.groupKey === "product")
    );
    return { scene: sceneList, product: productList };
  }, [tags]);

  function startCreate(groupKey: TagManagerGroupKey) {
    setCreating({ groupKey, name: "" });
  }

  function cancelCreate() {
    setCreating(null);
  }

  async function submitCreate() {
    if (!creating) return;
    const name = creating.name.trim();
    if (!name) return;
    await onCreate(creating.groupKey, name);
    setCreating(null);
  }

  function startEdit(tag: TagManagerTag) {
    setEditingId(tag.id);
    setEditingName(tag.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function submitEdit(originalName: string) {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) return;
    if (trimmed === originalName) {
      // 名称未变，无需调用
      cancelEdit();
      return;
    }
    await onUpdate(editingId, { name: trimmed });
    cancelEdit();
  }

  return (
    <div className={cn("space-y-8", className)}>
      {(["scene", "product"] as const).map((groupKey) => {
        const list = grouped[groupKey];
        const isCreatingHere = creating?.groupKey === groupKey;
        return (
          <fieldset
            key={groupKey}
            aria-label={GROUP_LABEL[groupKey]}
            className="space-y-3 rounded-lg border bg-surface p-5"
          >
            <legend className="px-1 text-base font-medium text-text-primary">
              {GROUP_LABEL[groupKey]}（{list.length}）
            </legend>

            <div className="flex items-center justify-between">
              <p className="text-xs text-text-tertiary">
                按拖拽顺序展示给员工；停用后历史关联仍保留
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isLoading || !!creating}
                onClick={() => startCreate(groupKey)}
                aria-label={`新增${GROUP_LABEL[groupKey]}`}
              >
                + 新增{GROUP_LABEL[groupKey]}
              </Button>
            </div>

            {/* 新建表单 */}
            {isCreatingHere ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-3">
                <label
                  htmlFor={`new-${groupKey}-name`}
                  className="text-xs text-text-secondary"
                >
                  {`新${GROUP_LABEL[groupKey]}名称`}
                </label>
                <Input
                  id={`new-${groupKey}-name`}
                  aria-label={`新${GROUP_LABEL[groupKey]}名称`}
                  value={creating.name}
                  maxLength={50}
                  onChange={(e) =>
                    setCreating((prev) =>
                      prev ? { ...prev, name: e.target.value } : prev
                    )
                  }
                  placeholder="例如：促单逼定"
                  disabled={isLoading}
                  className="w-[220px]"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={submitCreate}
                  disabled={isLoading}
                >
                  保存新标签
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={cancelCreate}
                  disabled={isLoading}
                >
                  取消新增
                </Button>
              </div>
            ) : null}

            {/* 标签列表 */}
            {list.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">
                {GROUP_EMPTY[groupKey]}
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {list.map((tag, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === list.length - 1;
                  const isEditing = editingId === tag.id;
                  return (
                    <li
                      key={tag.id}
                      className="flex flex-wrap items-center gap-2 px-3 py-2"
                    >
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`上移「${tag.name}」`}
                          disabled={isFirst || isLoading}
                          onClick={() => onMove(groupKey, tag.id, "up")}
                        >
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`下移「${tag.name}」`}
                          disabled={isLast || isLoading}
                          onClick={() => onMove(groupKey, tag.id, "down")}
                        >
                          <ChevronDown
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        </Button>
                      </div>

                      {isEditing ? (
                        <div className="flex flex-1 flex-wrap items-center gap-2">
                          <label
                            htmlFor={`edit-${tag.id}`}
                            className="sr-only"
                          >
                            编辑标签名称
                          </label>
                          <Input
                            id={`edit-${tag.id}`}
                            aria-label="编辑标签名称"
                            value={editingName}
                            maxLength={50}
                            onChange={(e) => setEditingName(e.target.value)}
                            disabled={isLoading}
                            className="w-[220px]"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={isLoading}
                            onClick={() => submitEdit(tag.name)}
                          >
                            保存编辑
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isLoading}
                            onClick={cancelEdit}
                          >
                            取消编辑
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span
                            data-testid="tag-name"
                            className="flex-1 text-sm text-text-primary"
                          >
                            {tag.name}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`编辑标签「${tag.name}」`}
                            disabled={isLoading || !!creating}
                            onClick={() => startEdit(tag)}
                          >
                            <Pencil
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span className="ml-1">编辑</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`删除标签「${tag.name}」`}
                            disabled={isLoading}
                            onClick={() => onDelete(tag.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span className="ml-1">删除</span>
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

export default TagManager;
