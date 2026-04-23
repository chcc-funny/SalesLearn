"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface KnowledgeInfo {
  id: string;
  title: string;
  category: string;
}

interface GeneratedQuestion {
  id: string;
  type: string;
  questionText: string;
  options: string[];
  correctAnswer: string;
}

const TYPE_LABELS: Record<string, string> = {
  memory: "记忆题",
  understanding: "理解题",
  application: "应用题",
  analysis: "分析题",
};

const QUESTION_TYPES = [
  { key: "memory", label: "记忆题" },
  { key: "understanding", label: "理解题" },
  { key: "application", label: "应用题" },
  { key: "analysis", label: "分析题" },
];

export default function QuizGeneratePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [knowledge, setKnowledge] = useState<KnowledgeInfo | null>(null);
  const [count, setCount] = useState(5);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    "memory",
    "understanding",
    "application",
    "analysis",
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedQuestion[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchKnowledge() {
      const res = await fetch(`/api/knowledge/${params.id}`);
      const json = await res.json();
      if (json.success) setKnowledge(json.data);
    }
    fetchKnowledge();
  }, [params.id]);

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type]
    );
  }

  async function handleGenerate() {
    if (selectedTypes.length === 0) {
      setError("请至少选择一种题型");
      return;
    }
    setError("");
    setIsGenerating(true);

    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgeId: params.id,
          count,
          types: selectedTypes,
        }),
      });
      const json = await res.json();

      if (json.success) {
        setGenerated(json.data.questions);
      } else {
        setError(json.error ?? "生成失败");
      }
    } catch {
      setError("生成失败，请稍后重试");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl">
        {/* 头部 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              AI 出题
            </h1>
            {knowledge && (
              <p className="text-sm text-text-secondary">
                知识点：{knowledge.title}
              </p>
            )}
          </div>
          <Button variant="outline" onClick={() => router.push(`/admin/knowledge/${params.id}/edit`)}>
            返回编辑
          </Button>
        </div>

        {/* 设置区域 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">出题设置</CardTitle>
            <CardDescription>选择题型和数量，AI 将自动生成题目</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>题目数量</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-32"
                disabled={isGenerating}
              />
            </div>

            <div className="space-y-2">
              <Label>题型选择（可多选）</Label>
              <div className="flex flex-wrap gap-2">
                {QUESTION_TYPES.map((qt) => {
                  const isSelected = selectedTypes.includes(qt.key);
                  return (
                    <button
                      key={qt.key}
                      onClick={() => toggleType(qt.key)}
                      disabled={isGenerating}
                      className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                        isSelected
                          ? "bg-primary-500 text-white"
                          : "bg-surface-muted text-text-secondary hover:bg-primary-100"
                      }`}
                    >
                      {qt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-error-bg px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}

            <Button
              className="bg-primary-500 hover:bg-primary-600"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? "AI 生成中..." : `生成 ${count} 道题目`}
            </Button>
          </CardContent>
        </Card>

        {/* 生成结果 */}
        {generated.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-text-primary">
                已生成 {generated.length} 道题目
              </h2>
              <Badge variant="outline">状态：审核中</Badge>
            </div>

            {generated.map((q, i) => (
              <Card key={q.id}>
                <CardContent className="pt-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-medium text-text-tertiary">
                      #{i + 1}
                    </span>
                    <Badge variant="secondary">
                      {TYPE_LABELS[q.type] ?? q.type}
                    </Badge>
                  </div>
                  <p className="mb-3 text-sm font-medium text-text-primary">
                    {q.questionText}
                  </p>
                  <div className="space-y-1">
                    {q.options.map((opt, j) => {
                      const letter = String.fromCharCode(65 + j);
                      const isCorrect = letter === q.correctAnswer;
                      return (
                        <div
                          key={j}
                          className={`rounded px-3 py-1.5 text-sm ${
                            isCorrect
                              ? "bg-success-bg font-medium text-success"
                              : "text-text-secondary"
                          }`}
                        >
                          {letter}. {opt}
                          {isCorrect && " ✓"}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}

            <div className="flex gap-3 pt-2">
              <Button
                className="bg-primary-500 hover:bg-primary-600"
                onClick={() => router.push("/admin/review")}
              >
                去审核题目
              </Button>
              <Button variant="outline" onClick={handleGenerate}>
                再生成一批
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
