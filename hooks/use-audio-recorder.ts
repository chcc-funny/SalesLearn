"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type RecorderStatus = "idle" | "recording" | "paused" | "stopped";

export interface RecorderResult {
  blob: Blob;
  url: string;
  duration: number;
}

export interface UseAudioRecorderReturn {
  status: RecorderStatus;
  duration: number;
  error: string | null;
  stream: MediaStream | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<RecorderResult | null>;
  reset: () => void;
}

/**
 * MediaRecorder hook for audio recording.
 * Returns status, duration, and control functions.
 */
export function useAudioRecorder(): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const pausedDurationRef = useRef(0);
  const resolveStopRef = useRef<((result: RecorderResult | null) => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      releaseStream();
    };
  }, []);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startTimer() {
    stopTimer();
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setDuration(pausedDurationRef.current + Math.floor(elapsed / 1000));
    }, 200);
  }

  function releaseStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    pausedDurationRef.current = 0;
    setDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer webm/opus, fallback to whatever is available
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current = [...chunksRef.current, e.data];
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const result: RecorderResult = { blob, url, duration };

        releaseStream();
        stopTimer();

        if (resolveStopRef.current) {
          resolveStopRef.current({ ...result, duration: pausedDurationRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000) });
          resolveStopRef.current = null;
        }
      };

      recorder.start(250); // Collect data every 250ms
      setStatus("recording");
      startTimer();
    } catch {
      setError("无法访问麦克风，请检查权限设置");
      setStatus("idle");
    }
  }, []);

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    recorder.pause();
    // Save accumulated duration
    pausedDurationRef.current += Math.floor(
      (Date.now() - startTimeRef.current) / 1000
    );
    stopTimer();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;

    recorder.resume();
    startTimer();
    setStatus("recording");
  }, []);

  const stop = useCallback((): Promise<RecorderResult | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }

      resolveStopRef.current = resolve;
      recorder.stop();
      setStatus("stopped");
    });
  }, []);

  const reset = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    releaseStream();
    stopTimer();
    chunksRef.current = [];
    pausedDurationRef.current = 0;
    setDuration(0);
    setStatus("idle");
    setError(null);
    mediaRecorderRef.current = null;
  }, []);

  return { status, duration, error, stream: streamRef.current, start, pause, resume, stop, reset };
}
