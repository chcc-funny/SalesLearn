"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface FeynmanChatResultProps {
  isConvinced: boolean;
  evalSummary: string | null;
  chatHistory: Array<{ role: "ai" | "user"; content: string }>;
  persona: "beginner" | "bargainer" | "expert";
  roundCount: number;
  onRetry: () => void;
  onChangePersona: () => void;
  onBack: () => void;
}

const PERSONA_LABELS: Record<FeynmanChatResultProps["persona"], string> = {
  beginner: "\u5c0f\u767d\u5ba2\u6237",
  bargainer: "\u6bd4\u4ef7\u5ba2\u6237",
  expert: "\u61c2\u8f66\u5ba2\u6237",
};

/** Stage B conviction result header */
function ResultHeader({
  isConvinced,
  roundCount,
}: {
  isConvinced: boolean;
  roundCount: number;
}) {
  if (isConvinced) {
    return (
      <div className="rounded-xl bg-success-bg p-6 text-center">
        <div className="text-5xl text-success">&#10003;</div>
        <p className="mt-2 text-lg font-bold text-success">
          成功说服！
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          用了 {roundCount} 轮完成对话
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-error-bg p-6 text-center">
      <div className="text-5xl text-error">&#10007;</div>
      <p className="mt-2 text-lg font-bold text-error">
        未能说服
      </p>
      <p className="mt-1 text-sm text-text-secondary">
        已用完 5 轮对话机会
      </p>
    </div>
  );
}

/** AI evaluation summary card */
function EvalSummaryCard({ summary }: { summary: string }) {
  return (
    <div className="rounded-lg border border-[#7C3AED]/30 bg-surface p-4">
      <h3 className="mb-2 text-sm font-medium text-[#7C3AED]">
        AI 评价
      </h3>
      <p className="text-sm leading-relaxed text-text-primary">
        {summary}
      </p>
    </div>
  );
}

/** Single chat message row */
function ChatMessage({ role, content }: { role: "ai" | "user"; content: string }) {
  const isAi = role === "ai";
  const labelText = isAi ? "AI客户" : "你";
  const labelColor = isAi
    ? "bg-[#7C3AED]/10 text-[#7C3AED]"
    : "bg-primary-500/10 text-primary-500";

  return (
    <div className="flex items-start gap-2 py-2">
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${labelColor}`}
      >
        {labelText}
      </span>
      <p className="text-sm leading-relaxed text-text-primary">{content}</p>
    </div>
  );
}

/** Collapsible chat history section */
function ChatHistorySection({
  chatHistory,
}: {
  chatHistory: FeynmanChatResultProps["chatHistory"];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg bg-surface p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <h3 className="text-sm font-medium text-text-primary">
          对话记录
        </h3>
        <span className="text-xs text-text-tertiary">
          {expanded ? "收起" : "展开"}
        </span>
      </button>
      {expanded && (
        <div className="mt-3 divide-y divide-border">
          {chatHistory.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Feynman Stage B chat evaluation result.
 * Shows conviction outcome, AI summary, chat replay, and action buttons.
 */
export function FeynmanChatResult({
  isConvinced,
  evalSummary,
  chatHistory,
  persona,
  roundCount,
  onRetry,
  onChangePersona,
  onBack,
}: FeynmanChatResultProps) {
  return (
    <div className="space-y-4">
      {/* Conviction result */}
      <ResultHeader isConvinced={isConvinced} roundCount={roundCount} />

      {/* Persona tag */}
      <div className="flex items-center gap-2">
        <span className="rounded bg-[#7C3AED]/10 px-2 py-0.5 text-xs font-medium text-[#7C3AED]">
          {PERSONA_LABELS[persona]}
        </span>
      </div>

      {/* AI evaluation summary */}
      {evalSummary && <EvalSummaryCard summary={evalSummary} />}

      {/* Chat replay (collapsible) */}
      {chatHistory.length > 0 && (
        <ChatHistorySection chatHistory={chatHistory} />
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" onClick={onBack}>
          返回列表
        </Button>
        <Button
          variant="outline"
          className="border-[#7C3AED]/30 text-[#7C3AED] hover:bg-[#7C3AED]/5"
          onClick={onChangePersona}
        >
          换个客户
        </Button>
        <Button
          className="flex-1 bg-[#7C3AED] text-white hover:bg-[#7C3AED]/90"
          onClick={onRetry}
        >
          再试一次
        </Button>
      </div>
    </div>
  );
}
