"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface QuestionItem {
  id: string;
  type: string;
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanations: Record<string, string>;
}

type AnswerState = "idle" | "selected" | "correct" | "incorrect";

const TYPE_LABELS: Record<string, string> = {
  memory: "记忆题",
  understanding: "理解题",
  application: "应用题",
  analysis: "分析题",
};

export default function QuizPage() {
  const params = useParams<{ knowledgeId: string }>();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>("idle");
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{
    questionId: string;
    isCorrect: boolean;
    selectedAnswer: string;
    correctAnswer: string;
    explanations: Record<string, string>;
  }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载题目
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/quiz/by-knowledge/${params.knowledgeId}`);
        const json = await res.json();
        if (json.success) {
          setTitle(json.data.knowledgeTitle);
          setQuestions(json.data.questions);
        }
      } catch {
        // 静默
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [params.knowledgeId]);

  // 计时器
  useEffect(() => {
    timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex]);

  // 重置计时器当切题
  useEffect(() => {
    setTimer(0);
  }, [currentIndex]);

  const question = questions[currentIndex];
  const isFinished = currentIndex >= questions.length && questions.length > 0;
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  function handleSelect(letter: string) {
    if (answerState !== "idle") return;
    setSelected(letter);
    setAnswerState("selected");
  }

  async function handleSubmit() {
    if (!selected || !question || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          selectedAnswer: selected,
          timeSpent: timer,
        }),
      });
      const json = await res.json();

      if (json.success) {
        const isCorrect = json.data.isCorrect;
        setAnswerState(isCorrect ? "correct" : "incorrect");
        setCorrectAnswer(json.data.correctAnswer);
        setExplanations(json.data.explanations ?? {});
        setResults((prev) => [
          ...prev,
          {
            questionId: question.id,
            isCorrect,
            selectedAnswer: selected,
            correctAnswer: json.data.correctAnswer,
            explanations: json.data.explanations ?? {},
          },
        ]);

        // 不自动跳题，等用户手动点击"下一题"或"查看结果"
      }
    } catch {
      // 静默
    } finally {
      setIsSubmitting(false);
    }
  }

  function goNext() {
    setCurrentIndex((i) => i + 1);
    setSelected(null);
    setAnswerState("idle");
    setCorrectAnswer(null);
    setExplanations({});
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-tertiary">加载题目中...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <p className="text-text-secondary">该知识点暂无题目</p>
        <Button variant="outline" onClick={() => router.push("/test")}>返回</Button>
      </div>
    );
  }

  // 测试完成 → 结果展示
  if (isFinished) {
    const correctCount = results.filter((r) => r.isCorrect).length;
    const percentage = Math.round((correctCount / results.length) * 100);

    return (
      <div className="min-h-screen bg-background">
        {/* 成绩摘要 */}
        <div className="bg-surface px-4 py-8 text-center">
          <p className="text-sm text-text-secondary">{title}</p>
          <div className="mt-3 text-5xl font-bold text-primary-500">
            {percentage}%
          </div>
          <p className="mt-2 text-text-primary">
            答对 {correctCount}/{results.length} 题
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Button
              className="bg-primary-500 hover:bg-primary-600"
              onClick={() => router.push("/test")}
            >
              返回测试中心
            </Button>
            <Button variant="outline" onClick={() => router.push("/review")}>
              错题本
            </Button>
          </div>
        </div>

        {/* 各题解析 */}
        <div className="mx-auto max-w-lg px-4 py-6">
          <h2 className="mb-4 text-base font-medium text-text-primary">
            答题详情
          </h2>
          <div className="space-y-3">
            {results.map((r, idx) => {
              const q = questions.find((qq) => qq.id === r.questionId);
              if (!q) return null;
              return (
                <ResultCard
                  key={r.questionId}
                  index={idx}
                  question={q}
                  result={r}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 顶栏 */}
      <div className="px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <button
            onClick={() => router.push("/test")}
            className="text-sm text-text-secondary"
          >
            ← 退出
          </button>
          <span className="text-xs text-text-tertiary">
            {currentIndex + 1}/{questions.length} · {timer}s
          </span>
        </div>
      </div>

      {/* 进度条 */}
      <div className="mx-4 h-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 题目区域 */}
      <div className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-lg">
          <span className="mb-2 inline-block rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700">
            {TYPE_LABELS[question.type] ?? question.type}
          </span>
          <h2 className="mb-6 text-base font-medium leading-relaxed text-text-primary">
            {question.questionText}
          </h2>

          {/* 选项 */}
          <div className="space-y-2.5">
            {question.options.map((opt, j) => {
              const letter = String.fromCharCode(65 + j);
              const isSelected = selected === letter;
              const isCorrectOption = correctAnswer === letter;
              const isWrong = answerState === "incorrect" && isSelected;

              let optionStyle = "border-border bg-surface";
              if (answerState === "idle" || answerState === "selected") {
                if (isSelected) optionStyle = "border-primary-500 bg-primary-50";
              } else {
                if (isCorrectOption) optionStyle = "border-success bg-success-bg";
                else if (isWrong) optionStyle = "border-error bg-error-bg";
              }

              return (
                <button
                  key={j}
                  onClick={() => handleSelect(letter)}
                  disabled={answerState === "correct" || answerState === "incorrect"}
                  className={`flex w-full items-start gap-3 rounded-lg border-2 p-3.5 text-left transition-colors ${optionStyle}`}
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
                    {letter}
                  </span>
                  <span className="text-sm text-text-primary">{opt}</span>
                </button>
              );
            })}
          </div>

          {/* 解析（答错时显示） */}
          {answerState === "incorrect" && selected && (
            <div className="mt-4 rounded-lg bg-error-bg p-3">
              <p className="text-xs font-medium text-error">
                正确答案：{correctAnswer}
              </p>
              {explanations[selected] && (
                <p className="mt-1 text-xs text-text-secondary">
                  你的选择：{explanations[selected]}
                </p>
              )}
              {correctAnswer && explanations[correctAnswer] && (
                <p className="mt-1 text-xs text-text-secondary">
                  正确解析：{explanations[correctAnswer]}
                </p>
              )}
            </div>
          )}

          {/* 答对反馈 + 解析 */}
          {answerState === "correct" && (
            <div className="mt-4 rounded-lg bg-success-bg p-3">
              <p className="text-sm font-medium text-success">回答正确！</p>
              {correctAnswer && explanations[correctAnswer] && (
                <p className="mt-1 text-xs text-text-secondary">
                  解析：{explanations[correctAnswer]}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="border-t bg-surface px-4 py-3">
        <div className="mx-auto max-w-lg">
          {answerState === "selected" && (
            <Button
              className="w-full bg-primary-500 hover:bg-primary-600"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "提交中..." : "提交答案"}
            </Button>
          )}
          {(answerState === "correct" || answerState === "incorrect") && (
            <Button
              className="w-full bg-primary-500 hover:bg-primary-600"
              onClick={goNext}
            >
              {currentIndex >= questions.length - 1 ? "查看结果" : "下一题"}
            </Button>
          )}
          {answerState === "idle" && (
            <p className="text-center text-xs text-text-tertiary">
              请选择一个选项
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** 结果页单题解析卡片 */
function ResultCard({
  index,
  question,
  result,
}: {
  index: number;
  question: QuestionItem;
  result: {
    isCorrect: boolean;
    selectedAnswer: string;
    correctAnswer: string;
    explanations: Record<string, string>;
  };
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-lg border p-3 ${
        result.isCorrect ? "border-success/30" : "border-error/30"
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start justify-between text-left"
      >
        <div className="flex items-start gap-2">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
              result.isCorrect ? "bg-success" : "bg-error"
            }`}
          >
            {result.isCorrect ? "✓" : "✗"}
          </span>
          <div>
            <p className="text-sm text-text-primary">
              <span className="text-text-tertiary">#{index + 1}</span>{" "}
              {question.questionText}
            </p>
            {!result.isCorrect && (
              <p className="mt-0.5 text-xs text-error">
                你选 {result.selectedAnswer}，正确答案 {result.correctAnswer}
              </p>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs text-text-tertiary">
          {expanded ? "收起" : "解析"}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1 pl-7">
          {question.options.map((opt, j) => {
            const letter = String.fromCharCode(65 + j);
            const isCorrectOpt = letter === result.correctAnswer;
            const isSelectedOpt = letter === result.selectedAnswer;
            return (
              <div
                key={j}
                className={`rounded px-2 py-1 text-xs ${
                  isCorrectOpt
                    ? "bg-success-bg text-success font-medium"
                    : isSelectedOpt && !result.isCorrect
                      ? "bg-error-bg text-error"
                      : "text-text-secondary"
                }`}
              >
                <span>
                  {letter}. {opt}
                  {isCorrectOpt && " ✓"}
                  {isSelectedOpt && !result.isCorrect && " ←你的选择"}
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
      )}
    </div>
  );
}
