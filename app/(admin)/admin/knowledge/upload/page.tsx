"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/shared/file-upload";
import { useTaskPolling } from "@/hooks/use-task-polling";
import { useState } from "react";
import { LLM_MODELS } from "@/lib/llm/openrouter";

const MODEL_OPTIONS = [
  { value: LLM_MODELS.KIMI_K2, label: "Kimi K2.6（默认，成本优化）" },
  { value: LLM_MODELS.CLAUDE_SONNET, label: "Claude Sonnet 4（质量优先）" },
  { value: LLM_MODELS.CLAUDE_HAIKU, label: "Claude Haiku 4.5（快速省钱）" },
];

export default function UploadKnowledgePage() {
  const router = useRouter();
  const [category, setCategory] = useState<string>("");
  const [model, setModel] = useState<string>(LLM_MODELS.KIMI_K2);

  const handleComplete = useCallback(() => {
    // onComplete callback — no action needed, UI updates via status
  }, []);

  const { status: taskStatus, result, startPolling, reset } = useTaskPolling({
    onComplete: handleComplete,
  });

  function handleUploadComplete(taskId: string) {
    startPolling(taskId);
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              上传培训资料
            </h1>
            <p className="text-sm text-text-secondary">
              上传文件后 AI 将自动切分为知识点
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/admin/knowledge")}>
            返回列表
          </Button>
        </div>

        <div className="space-y-6 rounded-lg border bg-surface p-6">
          <div className="grid grid-cols-2 gap-4">
            {/* 分类预选 */}
            <div className="space-y-2">
              <Label>预设分类（选填）</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="自动识别" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自动识别</SelectItem>
                  <SelectItem value="product">产品知识</SelectItem>
                  <SelectItem value="objection">客户异议</SelectItem>
                  <SelectItem value="closing">成交话术</SelectItem>
                  <SelectItem value="psychology">客户心理</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* AI 模型选择 */}
            <div className="space-y-2">
              <Label>AI 模型</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 文件上传 */}
          <FileUpload
            category={category === "auto" ? undefined : category || undefined}
            model={model}
            onUploadComplete={handleUploadComplete}
          />

          {/* 切分状态 */}
          {taskStatus === "processing" && (
            <div className="rounded-lg bg-primary-50 p-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 animate-pulse rounded-full bg-primary-500" />
                <span className="text-sm font-medium text-primary-700">
                  AI 正在分析文件并切分知识点...
                </span>
              </div>
              <p className="mt-1 text-xs text-text-tertiary">
                通常需要 10-30 秒，请耐心等待
              </p>
            </div>
          )}

          {taskStatus === "completed" && result && (
            <div className="rounded-lg bg-success-bg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-success">
                    切分完成！
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    共生成 {result.knowledgeIds.length} 个知识点，状态为「审核中」
                  </p>
                </div>
                <Badge variant="default">
                  {result.knowledgeIds.length} 个知识点
                </Badge>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="bg-primary-500 hover:bg-primary-600"
                  onClick={() => router.push("/admin/knowledge")}
                >
                  查看知识库
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    reset();
                  }}
                >
                  继续上传
                </Button>
              </div>
            </div>
          )}

          {taskStatus === "failed" && result && (
            <div className="rounded-lg bg-error-bg p-4">
              <p className="text-sm font-medium text-error">切分失败</p>
              <p className="mt-1 text-xs text-text-secondary">
                {result.error ?? "请重新上传或联系管理员"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
