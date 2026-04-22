"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ReviewItem {
  id: string;
  questionId: string | null;
  knowledgeId: string | null;
  knowledgeTitle: string | null;
  questionText: string | null;
  questionType: string | null;
  options: string[] | null;
  correctAnswer: string | null;
  explanations: Record<string, string> | null;
  nextReviewAt: string | null;
  reviewCount: number | null;
  correctStreak: number | null;
  isResolved: boolean | null;
}

interface ReviewResult {
  isCorrect: boolean;
  correctAnswer: string;
  explanations: Record<string, string>;
  resolved: boolean;
  correctStreak: number;
  nextReviewAt?: string;
  message: string;
}

type PageState = "loading" | "answering" | "result" | "error";

const TYPE_LABELS: Record<string, string> = {
  memory: "记忆题",
  understanding: "理解题",
  application: "应用题",
  analysis: "分析题",
};

function formatNextReview(isoStr: string): string {
  const date = new Date(isoStr);
  const diffMs = date.getTime() - Date.now();
  const diffHours = Math.round(diffMs / 3600000);

  if (diffHours < 1) return "1 小时后";
  if (diffHours < 24) return `${diffHours} 小时后`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} 天后`;
}

export default function ReviewPracticePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [item, setItem] = useState<ReviewItem | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);

  // 从列表 API 加载此条错题详情
  useEffect(() => {
    async function loadItem() {
      try {
        const res = await fetch("/api/review/list?tab=pending");
        const json = await res.json();
        if (!json.success) {
          setPageState("error");
          return;
        }

        const found = (json.data.items as ReviewItem[]).find(
          (i) => i.id === params.id
        );

        if (!found) {
          setPageState("error");
          return;
        }

        setItem(found);
        setPageState("answering");
      } catch {
        setPageState("error");
      }
    }
    loadItem();
  }, [params.id]);

  async function handleSubmit() {
    if (!selected || !item || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/review/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          errorBookId: item.id,
          selectedAnswer: selected,
        }),
      });
      const json = await res.json();

      if (json.success) {
        setResult(json.data);
        setPageState("result");
      }
    } catch {
      // 静默
    } finally {
      setIsSubmitting(false);
    }
  }

  // Loading
  if (pageState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-tertiary">加载中...</p>
      </div>
    );
  }

  // Error / not found
  if (pageState === "error" || !item) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <p className="text-text-secondary">错题记录不存在或已掌握</p>
        <Button variant="outline" onClick={() => router.push("/review")}>
          返回错题本
        </Button>
      </div>
    );
  }

  // Result feedback
  if (pageState === "result" && result) {
    return (
      <ReviewResultView
        item={item}
        result={result}
        selectedAnswer={selected!}
        onBack={() => router.push("/review")}
      />
    );
  }

  // Answering state
  const options = item.options ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <div className="px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <button
            onClick={() => router.push("/review")}
            className="text-sm text-text-secondary"
          >
            ← 返回
          </button>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span>连对 {item.correctStreak ?? 0}/3</span>
            <span>·</span>
            <span>复习 {(item.reviewCount ?? 0) + 1} 次</span>
          </div>
        </div>
      </div>

      {/* Progress dots */}
      <div className="mx-auto flex max-w-lg gap-1.5 px-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < (item.correctStreak ?? 0)
                ? "bg-success"
                : "bg-border"
            }`}
          />
        ))}
      </div>

      {/* Question area */}
      <div className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-lg">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-text-tertiary">
              {item.knowledgeTitle ?? "未知知识点"}
            </span>
            {item.questionType && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {TYPE_LABELS[item.questionType] ?? item.questionType}
              </Badge>
            )}
          </div>

          <h2 className="mb-6 text-base font-medium leading-relaxed text-text-primary">
            {item.questionText}
          </h2>

          {/* Options */}
          <div className="space-y-2.5">
            {options.map((opt, j) => {
              const letter = String.fromCharCode(65 + j);
              const isSelected = selected === letter;

              return (
                <button
                  key={j}
                  onClick={() => setSelected(letter)}
                  className={`flex w-full items-start gap-3 rounded-lg border-2 p-3.5 text-left transition-colors ${
                    isSelected
                      ? "border-primary-500 bg-primary-50"
                      : "border-border bg-surface"
                  }`}
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
                    {letter}
                  </span>
                  <span className="text-sm text-text-primary">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom button */}
      <div className="border-t bg-surface px-4 py-3">
        <div className="mx-auto max-w-lg">
          {selected ? (
            <Button
              className="w-full bg-primary-500 hover:bg-primary-600"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "提交中..." : "提交答案"}
            </Button>
          ) : (
            <p className="text-center text-xs text-text-tertiary">
              请选择一个选项
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Result feedback view */
function ReviewResultView({
  item,
  result,
  selectedAnswer,
  onBack,
}: {
  item: ReviewItem;
  result: ReviewResult;
  selectedAnswer: string;
  onBack: () => void;
}) {
  const options = item.options ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Feedback header */}
      <div
        className={`px-4 py-8 text-center ${
          result.isCorrect ? "bg-success-bg" : "bg-error-bg"
        }`}
      >
        <div
          className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white ${
            result.isCorrect ? "bg-success" : "bg-error"
          }`}
        >
          {result.isCorrect ? "✓" : "✗"}
        </div>
        <p
          className={`text-lg font-semibold ${
            result.isCorrect ? "text-success" : "text-error"
          }`}
        >
          {result.isCorrect ? "回答正确！" : "回答错误"}
        </p>
        <p className="mt-1 text-sm text-text-secondary">{result.message}</p>
      </div>

      {/* Details */}
      <div className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-lg space-y-4">
          {/* Streak progress */}
          <div className="rounded-lg bg-surface p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-text-secondary">掌握进度</span>
              <span className="font-medium text-text-primary">
                {result.resolved
                  ? "已掌握 ✓"
                  : `${result.correctStreak}/3`}
              </span>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full ${
                    i < result.correctStreak ? "bg-success" : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Next review time */}
          {!result.resolved && result.nextReviewAt && (
            <div className="rounded-lg border border-primary-200 bg-primary-50 p-3 text-center">
              <p className="text-xs text-text-tertiary">下次复习时间</p>
              <p className="mt-0.5 text-sm font-medium text-primary-600">
                {formatNextReview(result.nextReviewAt)}
              </p>
            </div>
          )}

          {/* Question + options review */}
          <div className="rounded-lg bg-surface p-4">
            <p className="mb-3 text-sm font-medium text-text-primary">
              {item.questionText}
            </p>
            <div className="space-y-1.5">
              {options.map((opt, j) => {
                const letter = String.fromCharCode(65 + j);
                const isCorrectOpt = letter === result.correctAnswer;
                const isSelectedOpt = letter === selectedAnswer;
                const isWrong = isSelectedOpt && !result.isCorrect;

                let style = "text-text-secondary";
                if (isCorrectOpt) style = "bg-success-bg text-success font-medium";
                else if (isWrong) style = "bg-error-bg text-error";

                return (
                  <div key={j} className={`rounded px-3 py-2 text-xs ${style}`}>
                    <span>
                      {letter}. {opt}
                      {isCorrectOpt && " ✓"}
                      {isWrong && " ← 你的选择"}
                    </span>
                    {result.explanations[letter] && (
                      <p className="mt-0.5 text-text-tertiary">
                        {result.explanations[letter]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action */}
      <div className="border-t bg-surface px-4 py-3">
        <div className="mx-auto max-w-lg">
          <Button
            className="w-full bg-primary-500 hover:bg-primary-600"
            onClick={onBack}
          >
            返回错题本
          </Button>
        </div>
      </div>
    </div>
  );
}
