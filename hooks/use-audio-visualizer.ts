"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/** Number of volume bars to display */
const BAR_COUNT = 24;

/** History length for rolling waveform effect */
const HISTORY_LENGTH = BAR_COUNT;

export interface UseAudioVisualizerReturn {
  /** Current volume level 0-1 */
  volume: number;
  /** Array of volume levels for bar visualization (length = BAR_COUNT) */
  bars: number[];
  /** Whether the visualizer is active */
  isActive: boolean;
}

/**
 * Web Audio API visualizer hook.
 * Analyzes a MediaStream and returns real-time volume data.
 */
export function useAudioVisualizer(
  stream: MediaStream | null,
  isRecording: boolean
): UseAudioVisualizerReturn {
  const [volume, setVolume] = useState(0);
  const [bars, setBars] = useState<number[]>(() => Array(BAR_COUNT).fill(0));

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const barsHistoryRef = useRef<number[]>(Array(HISTORY_LENGTH).fill(0));

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setVolume(0);
    setBars(Array(BAR_COUNT).fill(0));
    barsHistoryRef.current = Array(HISTORY_LENGTH).fill(0);
  }, []);

  useEffect(() => {
    if (!stream || !isRecording) {
      cleanup();
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);

      // Calculate RMS volume (0-1)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255;

      // Push to rolling history
      const history = barsHistoryRef.current;
      const newHistory = [...history.slice(1), rms];
      barsHistoryRef.current = newHistory;

      setVolume(rms);
      setBars(newHistory);

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return cleanup;
  }, [stream, isRecording, cleanup]);

  return {
    volume,
    bars,
    isActive: isRecording && stream !== null,
  };
}
