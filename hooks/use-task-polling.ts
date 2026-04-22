"use client";

import { useState, useEffect, useCallback } from "react";

type TaskStatus = "processing" | "completed" | "failed" | "idle";

interface TaskResult {
  id: string;
  status: TaskStatus;
  originalFileName: string;
  knowledgeIds: string[];
  error?: string;
  createdAt: string;
  completedAt?: string;
}

interface UseTaskPollingOptions {
  /** 轮询间隔（毫秒），默认 2000 */
  interval?: number;
  /** 完成或失败后的回调 */
  onComplete?: (result: TaskResult) => void;
  onError?: (error: string) => void;
}

export function useTaskPolling(options: UseTaskPollingOptions = {}) {
  const { interval = 2000, onComplete, onError } = options;
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus>("idle");
  const [result, setResult] = useState<TaskResult | null>(null);

  const startPolling = useCallback((id: string) => {
    setTaskId(id);
    setStatus("processing");
    setResult(null);
  }, []);

  const reset = useCallback(() => {
    setTaskId(null);
    setStatus("idle");
    setResult(null);
  }, []);

  useEffect(() => {
    if (!taskId || status !== "processing") return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/knowledge/tasks/${taskId}`);
        const json = await res.json();

        if (!json.success) return;

        const data = json.data as TaskResult;
        setResult(data);

        if (data.status === "completed") {
          setStatus("completed");
          onComplete?.(data);
        } else if (data.status === "failed") {
          setStatus("failed");
          onError?.(data.error ?? "任务失败");
        }
      } catch {
        // 网络错误时继续轮询
      }
    };

    const timer = setInterval(poll, interval);
    poll(); // 立即执行一次

    return () => clearInterval(timer);
  }, [taskId, status, interval, onComplete, onError]);

  return { taskId, status, result, startPolling, reset };
}
