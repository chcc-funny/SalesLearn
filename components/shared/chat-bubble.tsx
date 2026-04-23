"use client";

import { cn } from "@/lib/utils";

type Persona = "beginner" | "bargainer" | "expert";

interface ChatBubbleProps {
  role: "ai" | "user";
  content: string;
  persona?: Persona;
  isStreaming?: boolean;
}

const PERSONA_LABELS: Record<Persona, string> = {
  beginner: "小白客户",
  bargainer: "比价客户",
  expert: "懂车客户",
};

function AiAvatar({ persona }: { persona?: Persona }) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7C3AED]/20 text-xs text-[#7C3AED]">
        AI
      </div>
      {persona && (
        <span className="text-xs font-medium text-[#7C3AED]">
          {PERSONA_LABELS[persona]}
        </span>
      )}
    </div>
  );
}

function StreamingCursor() {
  return (
    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#7C3AED]" />
  );
}

export function ChatBubble({
  role,
  content,
  persona,
  isStreaming = false,
}: ChatBubbleProps) {
  const isAi = role === "ai";

  return (
    <div className={cn("flex flex-col", isAi ? "items-start" : "items-end")}>
      {isAi && <AiAvatar persona={persona} />}
      <div
        className={cn(
          "max-w-[80%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
          isAi
            ? "rounded-2xl rounded-tl-sm bg-[#7C3AED]/10 text-text-primary"
            : "rounded-2xl rounded-tr-sm bg-primary-500 text-white"
        )}
      >
        {content}
        {isStreaming && <StreamingCursor />}
      </div>
    </div>
  );
}
