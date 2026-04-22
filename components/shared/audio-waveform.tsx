"use client";

interface AudioWaveformProps {
  /** Array of volume levels (0-1) for each bar */
  bars: number[];
  /** Whether actively recording */
  isActive: boolean;
  /** Bar color class (default: primary) */
  colorClass?: string;
  /** Height of the container in pixels */
  height?: number;
}

/**
 * Real-time audio waveform visualization.
 * Renders a series of vertical bars representing volume levels.
 */
export function AudioWaveform({
  bars,
  isActive,
  colorClass = "bg-primary-500",
  height = 48,
}: AudioWaveformProps) {
  const minBarHeight = 2;

  return (
    <div
      className="flex items-center justify-center gap-[2px]"
      style={{ height }}
      role="img"
      aria-label={isActive ? "录音波形" : "等待录音"}
    >
      {bars.map((level, i) => {
        const barHeight = Math.max(
          minBarHeight,
          Math.round(level * height * 0.9)
        );

        return (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-75 ${
              isActive ? colorClass : "bg-border"
            }`}
            style={{
              height: barHeight,
              opacity: isActive ? 0.4 + level * 0.6 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
}
