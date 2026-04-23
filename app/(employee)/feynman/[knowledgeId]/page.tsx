"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AudioRecorder } from "@/components/shared/audio-recorder";
import { TranscriptEditor } from "@/components/shared/transcript-editor";
import { FeynmanResult } from "@/components/shared/feynman-result";
import type { AudioUploadResult } from "@/hooks/use-audio-upload";

type PageStep = "loading" | "record" | "transcribing" | "edit" | "evaluating" | "result" | "error";

interface KnowledgeData {
  id: string;
  title: string;
  category: string;
  keyPoints: string[];
  content: string;
}

interface EvalResult {
  scores: {
    completeness: number;
    accuracy: number;
    clarity: number;
    analogy: number;
  };
  totalScore: number;
  coveredPoints: string[];
  missedPoints: string[];
  errors: string[];
  suggestions: string;
  highlights?: string;
  canUnlockStageB: boolean;
}

export default function FeynmanPracticePage() {
  const params = useParams<{ knowledgeId: string }>();
  const router = useRouter();

  const [step, setStep] = useState<PageStep>("loading");
  const [knowledge, setKnowledge] = useState<KnowledgeData | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioContentType, setAudioContentType] = useState("audio/webm");
  const [audioDuration, setAudioDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showHints, setShowHints] = useState(false);

  // Load knowledge point
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/knowledge/${params.knowledgeId}`);
        const json = await res.json();
        if (json.success) {
          setKnowledge({
            ...json.data,
            keyPoints: json.data.keyPoints ?? json.data.key_points ?? [],
          });
          setStep("record");
        } else {
          setErrorMsg("知识点不存在或未发布");
          setStep("error");
        }
      } catch {
        setErrorMsg("加载知识点失败");
        setStep("error");
      }
    }
    load();
  }, [params.knowledgeId]);

  // Handle upload complete → trigger transcription
  const handleUploadComplete = useCallback(
    async (result: AudioUploadResult) => {
      setAudioUrl(result.url);
      setAudioDuration(result.duration);
      setStep("transcribing");

      try {
        const res = await fetch("/api/feynman/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioUrl: result.url,
            contentType: audioContentType,
            duration: result.duration || 30,
          }),
        });
        const json = await res.json();

        if (json.success) {
          const text = json.data.text ?? "";
          if (text.trim().length === 0) {
            // Empty transcription — blank recording
            setErrorMsg(
              json.data.warning ??
                "录音未识别到任何内容，请确保麦克风正常工作，在安静环境下重新录音"
            );
            setStep("error");
          } else {
            setTranscript(text);
            setStep("edit");
          }
        } else {
          setErrorMsg(json.error ?? "语音转文字失败");
          setStep("error");
        }
      } catch {
        setErrorMsg("语音转文字请求失败");
        setStep("error");
      }
    },
    [audioContentType]
  );

  // Handle transcript confirm → trigger evaluation
  async function handleEvaluate(confirmedText: string) {
    setTranscript(confirmedText);
    setStep("evaluating");

    try {
      const res = await fetch("/api/feynman/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgeId: params.knowledgeId,
          transcript: confirmedText,
          audioUrl: audioUrl ?? undefined,
        }),
      });
      const json = await res.json();

      if (json.success) {
        setEvalResult(json.data);
        setStep("result");
      } else {
        setErrorMsg(json.error ?? "AI 评分失败");
        setStep("error");
      }
    } catch {
      setErrorMsg("评分请求失败");
      setStep("error");
    }
  }

  function handleRetry() {
    setAudioUrl(null);
    setTranscript("");
    setEvalResult(null);
    setErrorMsg("");
    setStep("record");
  }

  // Loading
  if (step === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-tertiary">加载中...</p>
      </div>
    );
  }

  // Error with context-aware tips
  if (step === "error") {
    const tips = getErrorTips(errorMsg);
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4 px-4">
        <div className="mx-auto max-w-sm text-center">
          <div className="mb-3 text-3xl">{tips.icon}</div>
          <p className="text-sm text-text-primary font-medium">{tips.title}</p>
          <p className="mt-2 text-sm text-text-secondary">{errorMsg}</p>
          {tips.hint && (
            <p className="mt-2 text-xs text-text-tertiary">{tips.hint}</p>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push("/feynman")}>
            返回列表
          </Button>
          <Button
            className="bg-primary-500 hover:bg-primary-600"
            onClick={handleRetry}
          >
            {tips.retryLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <div className="border-b bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <button
            onClick={() => router.push("/feynman")}
            className="text-sm text-text-secondary"
          >
            ← 返回
          </button>
          <span className="text-xs text-text-tertiary">
            阶段 A · 关键点覆盖评分
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-lg">
          {/* Knowledge title */}
          <h1 className="mb-1 text-lg font-semibold text-text-primary">
            {knowledge?.title}
          </h1>

          {/* Key points hint (collapsible) */}
          {step === "record" && knowledge && (
            <div className="mb-4">
              <button
                onClick={() => setShowHints(!showHints)}
                className="text-xs text-primary-500 hover:text-primary-600"
              >
                {showHints ? "收起要点提示 ▲" : "查看要点提示 ▼"}
              </button>
              {showHints && (
                <div className="mt-2 rounded-lg bg-primary-50 p-3">
                  <p className="mb-1.5 text-xs font-medium text-primary-600">
                    核心要点（讲解时尽量覆盖）
                  </p>
                  <ul className="space-y-1">
                    {knowledge.keyPoints.map((p, i) => (
                      <li
                        key={i}
                        className="text-xs text-text-secondary"
                      >
                        {i + 1}. {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Step: Record */}
          {step === "record" && (
            <div className="mt-6">
              <p className="mb-6 text-center text-sm text-text-secondary">
                用自己的话，像给客户介绍一样讲解这个知识点
              </p>
              <AudioRecorder
                onUploadComplete={handleUploadComplete}
                onRecordingComplete={(result) => {
                  setAudioContentType(result.blob.type || "audio/webm");
                  setAudioDuration(result.duration);
                }}
                maxDuration={300}
              />
            </div>
          )}

          {/* Step: Transcribing */}
          {step === "transcribing" && (
            <div className="mt-12 text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-500" />
              <p className="text-sm text-text-secondary">
                正在将语音转为文字...
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                这可能需要几秒钟
              </p>
            </div>
          )}

          {/* Step: Edit transcript */}
          {step === "edit" && (
            <div className="mt-4">
              <TranscriptEditor
                originalText={transcript}
                onConfirm={handleEvaluate}
                onReRecord={handleRetry}
                isSubmitting={false}
              />
            </div>
          )}

          {/* Step: Evaluating */}
          {step === "evaluating" && (
            <div className="mt-12 text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-500" />
              <p className="text-sm text-text-secondary">
                AI 正在评分...
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                分析关键点覆盖度和表达质量
              </p>
            </div>
          )}

          {/* Step: Result */}
          {step === "result" && evalResult && (
            <div className="mt-4">
              <FeynmanResult
                scores={evalResult.scores}
                totalScore={evalResult.totalScore}
                coveredPoints={evalResult.coveredPoints}
                missedPoints={evalResult.missedPoints}
                errors={evalResult.errors}
                suggestions={evalResult.suggestions}
                highlights={evalResult.highlights}
                canUnlockStageB={evalResult.canUnlockStageB}
                onRetry={handleRetry}
                onBack={() => router.push("/feynman")}
                onUnlock={() =>
                  router.push(`/feynman/${params.knowledgeId}/chat`)
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Context-aware error tips based on error message content */
function getErrorTips(msg: string): {
  icon: string;
  title: string;
  hint: string | null;
  retryLabel: string;
} {
  if (msg.includes("未识别") || msg.includes("麦克风") || msg.includes("空白")) {
    return {
      icon: "🎙️",
      title: "录音未识别到内容",
      hint: "请检查麦克风权限，在安静环境下清晰讲解",
      retryLabel: "重新录音",
    };
  }
  if (msg.includes("过短")) {
    return {
      icon: "📝",
      title: "讲解内容不够充分",
      hint: "试着覆盖更多核心要点，像给客户详细介绍一样",
      retryLabel: "重新讲解",
    };
  }
  if (msg.includes("过长")) {
    return {
      icon: "✂️",
      title: "讲解内容过长",
      hint: "可以在编辑页面精简后再提交，或重新录制更精炼的版本",
      retryLabel: "重新讲解",
    };
  }
  if (msg.includes("无关") || msg.includes("跑题")) {
    return {
      icon: "🎯",
      title: "内容可能偏离主题",
      hint: "请确认选择了正确的知识点，讲解时聚焦核心要点",
      retryLabel: "重新讲解",
    };
  }
  if (msg.includes("异常") || msg.includes("转写")) {
    return {
      icon: "🔊",
      title: "语音识别异常",
      hint: "环境噪音可能影响识别，请在安静环境重试",
      retryLabel: "重新录音",
    };
  }
  if (msg.includes("AI") || msg.includes("评分")) {
    return {
      icon: "🤖",
      title: "AI 评分暂时不可用",
      hint: "这可能是临时的服务问题，稍等片刻再试",
      retryLabel: "重新评分",
    };
  }
  return {
    icon: "⚠️",
    title: "出了点问题",
    hint: null,
    retryLabel: "重试",
  };
}
