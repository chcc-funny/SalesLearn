"use client";

interface RadarChartProps {
  /** Score values 0-100 for each dimension */
  scores: {
    completeness: number;
    accuracy: number;
    clarity: number;
    analogy: number;
  };
  /** Size of the chart in pixels */
  size?: number;
}

const LABELS = [
  { key: "completeness" as const, label: "完整度", angle: -90 },
  { key: "accuracy" as const, label: "准确度", angle: 0 },
  { key: "analogy" as const, label: "类比", angle: 90 },
  { key: "clarity" as const, label: "清晰度", angle: 180 },
];

/**
 * SVG-based radar chart for four-dimension feynman scoring.
 */
export function RadarChart({ scores, size = 200 }: RadarChartProps) {
  const center = size / 2;
  const radius = size * 0.38;

  // Get polygon points for a given set of values (0-100)
  function getPoints(values: number[]): string {
    return values
      .map((val, i) => {
        const angle = LABELS[i].angle * (Math.PI / 180);
        const r = (val / 100) * radius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
  }

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [25, 50, 75, 100];

  const values = LABELS.map((l) => scores[l.key]);
  const dataPoints = getPoints(values);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto"
    >
      {/* Grid rings */}
      {rings.map((pct) => (
        <polygon
          key={pct}
          points={getPoints([pct, pct, pct, pct])}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-border"
        />
      ))}

      {/* Axis lines */}
      {LABELS.map((l) => {
        const angle = l.angle * (Math.PI / 180);
        const x2 = center + radius * Math.cos(angle);
        const y2 = center + radius * Math.sin(angle);
        return (
          <line
            key={l.key}
            x1={center}
            y1={center}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-border"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={dataPoints}
        fill="rgba(217, 119, 87, 0.2)"
        stroke="#D97757"
        strokeWidth="2"
      />

      {/* Data points */}
      {LABELS.map((l, i) => {
        const angle = l.angle * (Math.PI / 180);
        const r = (values[i] / 100) * radius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return (
          <circle
            key={l.key}
            cx={x}
            cy={y}
            r="3"
            fill="#D97757"
          />
        );
      })}

      {/* Labels */}
      {LABELS.map((l, i) => {
        const angle = l.angle * (Math.PI / 180);
        const labelR = radius + 22;
        const x = center + labelR * Math.cos(angle);
        const y = center + labelR * Math.sin(angle);

        return (
          <g key={`label-${l.key}`}>
            <text
              x={x}
              y={y - 6}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-text-secondary text-[11px]"
            >
              {l.label}
            </text>
            <text
              x={x}
              y={y + 8}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-text-primary text-[12px] font-semibold"
            >
              {values[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
