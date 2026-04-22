"use client";

import { Button } from "@/components/ui/button";
import { RadarChart } from "@/components/shared/radar-chart";

interface EvalScores {
  completeness: number;
  accuracy: number;
  clarity: number;
  analogy: number;
}

interface FeynmanResultProps {
  scores: EvalScores;
  totalScore: number;
  coveredPoints: string[];
  missedPoints: string[];
  errors: string[];
  suggestions: string;
  highlights?: string;
  canUnlockStageB: boolean;
  onRetry: () => void;
  onBack: () => void;
}

function scoreColorClass(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning-600";
  return "text-error";
}

function scoreBgClass(score: number): string {
  if (score >= 80) return "bg-success-bg";
  if (score >= 60) return "bg-warning-bg";
  return "bg-error-bg";
}

/**
 * Feynman evaluation result display.
 * Shows radar chart, key points, errors, and suggestions.
 */
export function FeynmanResult({
  scores,
  totalScore,
  coveredPoints,
  missedPoints,
  errors,
  suggestions,
  highlights,
  canUnlockStageB,
  onRetry,
  onBack,
}: FeynmanResultProps) {
  return (
    <div className="space-y-4">
      {/* Total score header */}
      <div
        className={`rounded-xl p-6 text-center ${scoreBgClass(totalScore)}`}
      >
        <p className="text-sm text-text-secondary">综合评分</p>
        <div className={`mt-1 text-5xl font-bold ${scoreColorClass(totalScore)}`}>
          {totalScore}
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          {totalScore >= 80
            ? "优秀！可以解锁 AI 客户实战"
            : totalScore >= 60
              ? "还不错，继续加油！"
              : "需要多加练习"}
        </p>
      </div>

      {/* Radar chart */}
      <div className="rounded-lg bg-surface p-4">
        <h3 className="mb-2 text-center text-sm font-medium text-text-primary">
          四维评分
        </h3>
        <RadarChart scores={scores} size={220} />
        {/* Score bars */}
        <div className="mt-3 space-y-2">
          <ScoreBar label="完整度" score={scores.completeness} weight="30%" />
          <ScoreBar label="准确度" score={scores.accuracy} weight="30%" />
          <ScoreBar label="清晰度" score={scores.clarity} weight="20%" />
          <ScoreBar label="类比" score={scores.analogy} weight="20%" />
        </div>
      </div>

      {/* Highlights */}
      {highlights && (
        <div className="rounded-lg border border-success/30 bg-success-bg p-3">
          <p className="text-xs font-medium text-success">讲得好的地方</p>
          <p className="mt-1 text-sm text-text-primary">{highlights}</p>
        </div>
      )}

      {/* Covered points */}
      {coveredPoints.length > 0 && (
        <div className="rounded-lg bg-surface p-4">
          <h3 className="mb-2 text-sm font-medium text-text-primary">
            已覆盖要点
          </h3>
          <ul className="space-y-1.5">
            {coveredPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0 text-success">&#10003;</span>
                <span className="text-text-primary">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missed points */}
      {missedPoints.length > 0 && (
        <div className="rounded-lg bg-surface p-4">
          <h3 className="mb-2 text-sm font-medium text-text-primary">
            遗漏要点
          </h3>
          <ul className="space-y-1.5">
            {missedPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0 text-warning">&#9888;</span>
                <span className="text-text-primary">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-lg bg-surface p-4">
          <h3 className="mb-2 text-sm font-medium text-error">
            需要纠正
          </h3>
          <ul className="space-y-1.5">
            {errors.map((err, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0 text-error">&#10007;</span>
                <span className="text-text-primary">{err}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {suggestions && (
        <div className="rounded-lg border border-primary-200 bg-primary-50 p-3">
          <p className="text-xs font-medium text-primary-600">改进建议</p>
          <p className="mt-1 text-sm text-text-primary">{suggestions}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" onClick={onBack}>
          返回列表
        </Button>
        {canUnlockStageB ? (
          <Button className="flex-1 bg-success hover:bg-success/90 text-white">
            解锁 AI 客户实战
          </Button>
        ) : (
          <Button
            className="flex-1 bg-primary-500 hover:bg-primary-600"
            onClick={onRetry}
          >
            再试一次
          </Button>
        )}
      </div>
    </div>
  );
}

/** Individual score bar */
function ScoreBar({
  label,
  score,
  weight,
}: {
  label: string;
  score: number;
  weight: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-text-secondary">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            score >= 80
              ? "bg-success"
              : score >= 60
                ? "bg-warning"
                : "bg-error"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-medium text-text-primary">
        {score}
      </span>
      <span className="w-8 shrink-0 text-right text-[10px] text-text-tertiary">
        {weight}
      </span>
    </div>
  );
}
