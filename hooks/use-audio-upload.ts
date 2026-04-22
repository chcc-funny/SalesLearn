"use client";

import { useState, useCallback, useRef } from "react";

export type UploadStatus = "idle" | "compressing" | "uploading" | "done" | "error";

export interface AudioUploadResult {
  url: string;
  duration: number;
}

export interface UseAudioUploadReturn {
  status: UploadStatus;
  progress: number;
  error: string | null;
  result: AudioUploadResult | null;
  upload: (blob: Blob, duration: number) => Promise<AudioUploadResult | null>;
  reset: () => void;
}

/**
 * Hook for uploading recorded audio to the server.
 * Handles compression (if possible) and progress tracking.
 */
export function useAudioUpload(): UseAudioUploadReturn {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AudioUploadResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const upload = useCallback(
    async (
      audioBlob: Blob,
      duration: number
    ): Promise<AudioUploadResult | null> => {
      setError(null);
      setProgress(0);
      setResult(null);

      try {
        // Step 1: Compress if possible (downsample large files)
        setStatus("compressing");
        const compressedBlob = await compressAudio(audioBlob);
        setProgress(20);

        // Step 2: Upload via FormData
        setStatus("uploading");
        const formData = new FormData();
        const ext = getExtension(compressedBlob.type);
        formData.append("file", compressedBlob, `recording_${Date.now()}.${ext}`);
        formData.append("duration", String(duration));

        abortRef.current = new AbortController();

        // Use XMLHttpRequest for real upload progress
        const uploadResult = await uploadWithProgress(
          "/api/feynman/upload-audio",
          formData,
          abortRef.current.signal,
          (pct) => setProgress(20 + Math.round(pct * 0.8))
        );

        setProgress(100);
        setStatus("done");
        setResult(uploadResult);
        return uploadResult;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "上传失败，请重试";
        setError(message);
        setStatus("error");
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus("idle");
    setProgress(0);
    setError(null);
    setResult(null);
  }, []);

  return { status, progress, error, result, upload, reset };
}

/**
 * Compress audio by re-encoding if the blob is large.
 * For small files (<2MB), skip compression.
 */
async function compressAudio(blob: Blob): Promise<Blob> {
  const TWO_MB = 2 * 1024 * 1024;
  if (blob.size <= TWO_MB) {
    return blob;
  }

  // For larger files, try to use a lower bitrate re-encoding via AudioContext
  // This is a best-effort approach — not all browsers support encoding
  // Fall back to original blob if compression fails
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Downsample to mono 16kHz for speech (sufficient for ASR)
    const targetSampleRate = 16000;
    const offlineCtx = new OfflineAudioContext(
      1, // mono
      Math.ceil(audioBuffer.duration * targetSampleRate),
      targetSampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    const wavBlob = audioBufferToWav(rendered);

    await audioContext.close();

    // Only use compressed version if it's actually smaller
    return wavBlob.size < blob.size ? wavBlob : blob;
  } catch {
    // Compression failed, use original
    return blob;
  }
}

/** Convert AudioBuffer to WAV Blob */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Write audio data
  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < channelData.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function getExtension(mimeType: string): string {
  const base = mimeType.split(";")[0];
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
  };
  return map[base] ?? "webm";
}

/** Upload FormData with progress tracking via XMLHttpRequest */
function uploadWithProgress(
  url: string,
  formData: FormData,
  signal: AbortSignal,
  onProgress: (percentage: number) => void
): Promise<AudioUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded / e.total);
      }
    });

    xhr.addEventListener("load", () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (json.success && json.data) {
          resolve(json.data);
        } else {
          reject(new Error(json.error ?? "上传失败"));
        }
      } catch {
        reject(new Error("服务器响应解析失败"));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("网络错误，请重试")));
    xhr.addEventListener("abort", () => reject(new Error("上传已取消")));

    signal.addEventListener("abort", () => xhr.abort());

    xhr.open("POST", url);
    xhr.send(formData);
  });
}
