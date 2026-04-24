"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";

type UploadStatus = "idle" | "uploading" | "processing" | "completed" | "failed";

interface FileUploadProps {
  onUploadComplete?: (taskId: string) => void;
  onError?: (error: string) => void;
  category?: string;
  model?: string;
  accept?: string;
}

const STATUS_LABELS: Record<UploadStatus, string> = {
  idle: "选择文件或拖拽到此处",
  uploading: "上传中...",
  processing: "AI 正在切分知识点...",
  completed: "切分完成",
  failed: "处理失败",
};

export function FileUpload({
  onUploadComplete,
  onError,
  category,
  model,
  accept = ".pdf,.txt,.md,.docx",
}: FileUploadProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setError("");
      setStatus("uploading");

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (category) formData.append("category", category);
        if (model) formData.append("model", model);

        const res = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
        });

        const json = await res.json();

        if (!json.success) {
          throw new Error(json.error ?? "上传失败");
        }

        setStatus("processing");
        onUploadComplete?.(json.data.taskId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "上传失败";
        setError(message);
        setStatus("failed");
        onError?.(message);
      }
    },
    [category, model, onUploadComplete, onError]
  );

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const isUploading = status === "uploading" || status === "processing";

  return (
    <div className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
          isDragging
            ? "border-primary-500 bg-primary-50"
            : status === "failed"
              ? "border-error bg-error-bg"
              : status === "completed"
                ? "border-success bg-success-bg"
                : "border-border hover:border-primary-300 hover:bg-primary-50/50"
        } ${isUploading ? "pointer-events-none opacity-70" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          disabled={isUploading}
        />

        {/* 状态图标 */}
        <div className="mb-3 text-3xl">
          {status === "idle" && "📄"}
          {status === "uploading" && "⬆️"}
          {status === "processing" && "🤖"}
          {status === "completed" && "✅"}
          {status === "failed" && "❌"}
        </div>

        <p className="text-sm font-medium text-text-primary">
          {STATUS_LABELS[status]}
        </p>

        {fileName && (
          <p className="mt-1 text-xs text-text-tertiary">{fileName}</p>
        )}

        {/* 进度动画 */}
        {isUploading && (
          <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-border">
            <div className="h-full animate-pulse rounded-full bg-primary-500"
              style={{ width: status === "uploading" ? "40%" : "80%" }}
            />
          </div>
        )}

        {status === "idle" && (
          <p className="mt-2 text-xs text-text-tertiary">
            支持 PDF、TXT、Markdown、DOCX（最大 10MB）
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-error-bg px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}

      {status === "failed" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setStatus("idle");
            setFileName("");
            setError("");
          }}
        >
          重新上传
        </Button>
      )}
    </div>
  );
}
