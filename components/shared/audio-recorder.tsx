"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useAudioRecorder,
  type RecorderResult,
  type RecorderStatus,
} from "@/hooks/use-audio-recorder";
import { useAudioVisualizer } from "@/hooks/use-audio-visualizer";
import { useAudioUpload, type AudioUploadResult } from "@/hooks/use-audio-upload";
import { AudioWaveform } from "@/components/shared/audio-waveform";

interface AudioRecorderProps {
  /** Called when recording is done (before upload) */
  onRecordingComplete?: (result: RecorderResult) => void;
  /** Called after successful upload to Vercel Blob */
  onUploadComplete?: (result: AudioUploadResult) => void;
  /** Enable auto-upload after recording */
  autoUpload?: boolean;
  maxDuration?: number; // Max seconds, default 300 (5min)
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const STATUS_LABELS: Record<RecorderStatus, string> = {
  idle: "准备录音",
  recording: "录音中...",
  paused: "已暂停",
  stopped: "录音完成",
};

export function AudioRecorder({
  onRecordingComplete,
  onUploadComplete,
  autoUpload = false,
  maxDuration = 300,
}: AudioRecorderProps) {
  const { status, duration, error, stream, start, pause, resume, stop, reset } =
    useAudioRecorder();
  const { bars, isActive } = useAudioVisualizer(
    stream,
    status === "recording"
  );
  const {
    status: uploadStatus,
    progress: uploadProgress,
    error: uploadError,
    upload,
    reset: resetUpload,
  } = useAudioUpload();
  const [result, setResult] = useState<RecorderResult | null>(null);

  // Auto-stop at max duration
  if (status === "recording" && duration >= maxDuration) {
    void handleStop();
  }

  async function handleStop() {
    const res = await stop();
    if (res) {
      setResult(res);
      onRecordingComplete?.(res);
      if (autoUpload) {
        await handleUpload(res);
      }
    }
  }

  async function handleConfirm() {
    if (!result) return;
    onRecordingComplete?.(result);
    await handleUpload(result);
  }

  async function handleUpload(rec: RecorderResult) {
    const uploadResult = await upload(rec.blob, rec.duration);
    if (uploadResult) {
      onUploadComplete?.(uploadResult);
    }
  }

  function handleReset() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
    setResult(null);
    reset();
    resetUpload();
  }

  const isUploading = uploadStatus === "compressing" || uploadStatus === "uploading";

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Status label */}
      <p className="text-sm text-text-secondary">{STATUS_LABELS[status]}</p>

      {/* Duration display */}
      <div className="relative flex items-center justify-center">
        {/* Pulse animation ring */}
        {status === "recording" && (
          <span className="absolute h-28 w-28 animate-ping rounded-full bg-primary-200 opacity-30" />
        )}
        <div
          className={`relative flex h-24 w-24 items-center justify-center rounded-full border-4 transition-colors ${
            status === "recording"
              ? "border-primary-500 bg-primary-50"
              : status === "paused"
                ? "border-warning bg-warning-bg"
                : "border-border bg-surface"
          }`}
        >
          <span className="text-2xl font-mono font-semibold text-text-primary">
            {formatDuration(duration)}
          </span>
        </div>
      </div>

      {/* Waveform visualization */}
      {(status === "recording" || status === "paused") && (
        <div className="w-full max-w-xs">
          <AudioWaveform bars={bars} isActive={isActive} height={48} />
        </div>
      )}

      {/* Max duration hint */}
      {status === "recording" && duration > 0 && (
        <p className="text-xs text-text-tertiary">
          最长 {Math.floor(maxDuration / 60)} 分钟
        </p>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {status === "idle" && (
          <Button
            className="bg-primary-500 hover:bg-primary-600 px-6"
            onClick={start}
          >
            开始录音
          </Button>
        )}

        {status === "recording" && (
          <>
            <Button variant="outline" onClick={pause}>
              暂停
            </Button>
            <Button
              className="bg-error hover:bg-error/90 text-white px-6"
              onClick={handleStop}
            >
              停止
            </Button>
          </>
        )}

        {status === "paused" && (
          <>
            <Button
              className="bg-primary-500 hover:bg-primary-600"
              onClick={resume}
            >
              继续
            </Button>
            <Button
              className="bg-error hover:bg-error/90 text-white px-6"
              onClick={handleStop}
            >
              停止
            </Button>
          </>
        )}

        {status === "stopped" && result && !isUploading && uploadStatus !== "done" && (
          <>
            <Button variant="outline" onClick={handleReset}>
              重新录音
            </Button>
            <Button
              className="bg-primary-500 hover:bg-primary-600 px-6"
              onClick={handleConfirm}
            >
              使用此录音
            </Button>
          </>
        )}
      </div>

      {/* Playback preview */}
      {status === "stopped" && result && (
        <div className="w-full max-w-xs">
          <audio
            src={result.url}
            controls
            className="w-full"
          />
          <p className="mt-1 text-center text-xs text-text-tertiary">
            录音时长：{formatDuration(result.duration)}
          </p>
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="w-full max-w-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>
              {uploadStatus === "compressing" ? "压缩音频..." : "上传中..."}
            </span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload complete */}
      {uploadStatus === "done" && (
        <div className="rounded-lg bg-success-bg p-3 text-center">
          <p className="text-sm font-medium text-success">上传成功！</p>
        </div>
      )}

      {/* Error message */}
      {(error || uploadError) && (
        <p className="text-sm text-error">{error ?? uploadError}</p>
      )}
    </div>
  );
}
