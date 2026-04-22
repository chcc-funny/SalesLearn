"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface TranscriptEditorProps {
  /** Original ASR transcription text */
  originalText: string;
  /** Called when user confirms the (possibly edited) text */
  onConfirm: (text: string) => void;
  /** Called when user wants to re-record */
  onReRecord?: () => void;
  /** Whether the confirm action is in progress */
  isSubmitting?: boolean;
}

type ViewMode = "edit" | "diff";

/**
 * Transcript editor with diff highlighting.
 * Allows users to correct ASR transcription before submitting for evaluation.
 */
export function TranscriptEditor({
  originalText,
  onConfirm,
  onReRecord,
  isSubmitting = false,
}: TranscriptEditorProps) {
  const [editedText, setEditedText] = useState(originalText);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");

  const hasChanges = editedText !== originalText;
  const isEmpty = editedText.trim().length === 0;
  const charCount = editedText.trim().length;

  const diffSegments = useMemo(() => {
    if (!hasChanges) return [];
    return computeSimpleDiff(originalText, editedText);
  }, [originalText, editedText, hasChanges]);

  function handleReset() {
    setEditedText(originalText);
    setViewMode("edit");
  }

  function handleConfirm() {
    if (!isEmpty) {
      onConfirm(editedText.trim());
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">转写文本</h3>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={() =>
                setViewMode(viewMode === "edit" ? "diff" : "edit")
              }
              className="text-xs text-primary-500 hover:text-primary-600"
            >
              {viewMode === "edit" ? "查看修改" : "继续编辑"}
            </button>
          )}
          {hasChanges && (
            <button
              onClick={handleReset}
              className="text-xs text-text-tertiary hover:text-text-secondary"
            >
              还原
            </button>
          )}
        </div>
      </div>

      {/* Edit / Diff view */}
      {viewMode === "edit" ? (
        <Textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          placeholder="转写文本将显示在这里..."
          className="min-h-[120px] text-sm leading-relaxed resize-y"
          disabled={isSubmitting}
        />
      ) : (
        <DiffView segments={diffSegments} />
      )}

      {/* Footer info */}
      <div className="flex items-center justify-between text-xs text-text-tertiary">
        <span>
          {charCount} 字
          {hasChanges && (
            <span className="ml-2 text-primary-500">已修改</span>
          )}
        </span>
        <span>可点击文本直接修正错误</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {onReRecord && (
          <Button
            variant="outline"
            onClick={onReRecord}
            disabled={isSubmitting}
          >
            重新录音
          </Button>
        )}
        <Button
          className="flex-1 bg-primary-500 hover:bg-primary-600"
          onClick={handleConfirm}
          disabled={isEmpty || isSubmitting}
        >
          {isSubmitting ? "提交中..." : "确认并提交评分"}
        </Button>
      </div>
    </div>
  );
}

// --- Diff utilities ---

interface DiffSegment {
  type: "same" | "added" | "removed";
  text: string;
}

/** Diff view component showing added/removed segments */
function DiffView({ segments }: { segments: DiffSegment[] }) {
  if (segments.length === 0) {
    return (
      <div className="rounded-md border p-3 text-sm text-text-secondary">
        无变更
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 text-sm leading-relaxed">
      {segments.map((seg, i) => {
        if (seg.type === "same") {
          return (
            <span key={i} className="text-text-primary">
              {seg.text}
            </span>
          );
        }
        if (seg.type === "removed") {
          return (
            <span
              key={i}
              className="bg-error-bg text-error line-through"
            >
              {seg.text}
            </span>
          );
        }
        // added
        return (
          <span key={i} className="bg-success-bg text-success">
            {seg.text}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Simple character-level diff for short texts.
 * Groups consecutive same/different characters into segments.
 * Uses a greedy LCS approach suitable for transcript corrections.
 */
function computeSimpleDiff(
  original: string,
  edited: string
): DiffSegment[] {
  // Find longest common subsequence using word-level diffing
  const origWords = tokenize(original);
  const editWords = tokenize(edited);

  const lcs = computeLCS(origWords, editWords);
  const segments: DiffSegment[] = [];

  let oi = 0;
  let ei = 0;
  let li = 0;

  while (oi < origWords.length || ei < editWords.length) {
    if (li < lcs.length) {
      // Output removed words before next LCS match
      while (oi < origWords.length && origWords[oi] !== lcs[li]) {
        pushSegment(segments, "removed", origWords[oi]);
        oi++;
      }
      // Output added words before next LCS match
      while (ei < editWords.length && editWords[ei] !== lcs[li]) {
        pushSegment(segments, "added", editWords[ei]);
        ei++;
      }
      // Output matching word
      if (oi < origWords.length && ei < editWords.length) {
        pushSegment(segments, "same", origWords[oi]);
        oi++;
        ei++;
        li++;
      }
    } else {
      // Remaining words after LCS exhausted
      while (oi < origWords.length) {
        pushSegment(segments, "removed", origWords[oi]);
        oi++;
      }
      while (ei < editWords.length) {
        pushSegment(segments, "added", editWords[ei]);
        ei++;
      }
    }
  }

  return segments;
}

/** Tokenize text into words preserving whitespace */
function tokenize(text: string): string[] {
  return text.match(/\S+|\s+/g) ?? [];
}

/** Merge consecutive segments of same type */
function pushSegment(
  segments: DiffSegment[],
  type: DiffSegment["type"],
  text: string
) {
  const last = segments[segments.length - 1];
  if (last && last.type === type) {
    segments[segments.length - 1] = { ...last, text: last.text + text };
  } else {
    segments.push({ type, text });
  }
}

/** Compute LCS of two string arrays */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  // For very long texts, use a simpler approach to avoid O(mn) memory
  if (m * n > 100000) {
    return greedyLCS(a, b);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/** Greedy LCS for large texts - O(n) memory */
function greedyLCS(a: string[], b: string[]): string[] {
  const bIndex = new Map<string, number[]>();
  b.forEach((word, idx) => {
    const arr = bIndex.get(word) ?? [];
    bIndex.set(word, [...arr, idx]);
  });

  const result: string[] = [];
  let lastJ = -1;

  for (const word of a) {
    const positions = bIndex.get(word);
    if (!positions) continue;

    const pos = positions.find((p) => p > lastJ);
    if (pos !== undefined) {
      result.push(word);
      lastJ = pos;
    }
  }

  return result;
}
