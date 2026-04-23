"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatBubble } from "@/components/shared/chat-bubble";
import { useFeynmanChat } from "@/hooks/use-feynman-chat";

type Persona = "beginner" | "bargainer" | "expert";

interface FeynmanChatProps {
  knowledgeId: string;
  knowledgeTitle: string;
  persona: Persona;
  onComplete: (result: {
    isConvinced: boolean;
    evalSummary: string | null;
    chatHistory: Array<{ role: "ai" | "user"; content: string }>;
  }) => void;
  onBack?: () => void;
}

const PERSONA_LABELS: Record<Persona, string> = {
  beginner: "小白客户",
  bargainer: "比价客户",
  expert: "懂车客户",
};

const MAX_ROUNDS = 5;

function ChatHeader({
  persona,
  roundNumber,
  onBack,
}: {
  persona: Persona;
  roundNumber: number;
  onBack?: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 border-b bg-surface px-4 py-3">
      <div className="mx-auto flex max-w-lg items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          ← 返回
        </button>
        <Badge className="border-transparent bg-[#7C3AED]/10 text-[#7C3AED] hover:bg-[#7C3AED]/20">
          {PERSONA_LABELS[persona]}
        </Badge>
        <span className="text-xs text-text-tertiary">
          第 {roundNumber}/{MAX_ROUNDS} 轮
        </span>
      </div>
    </div>
  );
}

function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  return (
    <div className="sticky bottom-0 border-t bg-surface px-4 py-3">
      <div className="mx-auto flex max-w-lg items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={disabled ? "AI 正在回复..." : "输入你的回答..."}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          size="sm"
          className="bg-primary-500 hover:bg-primary-600"
        >
          发送
        </Button>
      </div>
    </div>
  );
}

function CompleteBanner({ isConvinced }: { isConvinced: boolean }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 text-center">
      <div className="rounded-xl bg-surface p-4">
        <p className="text-2xl mb-2">{isConvinced ? "🎉" : "💪"}</p>
        <p className="text-sm font-medium text-text-primary">
          {isConvinced ? "客户已被说服！" : "对话已结束"}
        </p>
        <p className="mt-1 text-xs text-text-tertiary">
          {isConvinced
            ? "你的讲解成功打动了客户"
            : "继续练习，提升说服力"}
        </p>
      </div>
    </div>
  );
}

export function FeynmanChat({
  knowledgeId,
  knowledgeTitle,
  persona,
  onComplete,
  onBack,
}: FeynmanChatProps) {
  const {
    messages,
    isLoading,
    isComplete,
    isConvinced,
    roundNumber,
    evalSummary,
    error,
    sendMessage,
    startConversation,
  } = useFeynmanChat({ knowledgeId, persona });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasStartedRef = useRef(false);

  // Auto-start conversation
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startConversation();
  }, [startConversation]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Notify parent when complete (once only)
  const hasNotifiedRef = useRef(false);
  useEffect(() => {
    if (!isComplete || hasNotifiedRef.current) return;
    hasNotifiedRef.current = true;
    onComplete({
      isConvinced,
      evalSummary,
      chatHistory: messages,
    });
  }, [isComplete, isConvinced, evalSummary, messages, onComplete]);

  const handleSend = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <ChatHeader
        persona={persona}
        roundNumber={roundNumber}
        onBack={onBack}
      />

      {/* Knowledge title */}
      <div className="border-b px-4 py-2">
        <p className="mx-auto max-w-lg text-xs text-text-tertiary truncate">
          {knowledgeTitle}
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg space-y-4">
          {messages.map((msg, idx) => (
            <ChatBubble
              key={idx}
              role={msg.role}
              content={msg.content}
              persona={msg.role === "ai" ? persona : undefined}
              isStreaming={
                isLoading &&
                msg.role === "ai" &&
                idx === messages.length - 1
              }
            />
          ))}

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
              {error}
            </div>
          )}

          {isComplete && <CompleteBanner isConvinced={isConvinced} />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area or complete state */}
      {!isComplete && (
        <ChatInput onSend={handleSend} disabled={isLoading} />
      )}
    </div>
  );
}
