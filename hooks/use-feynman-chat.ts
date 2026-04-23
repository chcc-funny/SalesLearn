"use client";

import { useState, useCallback, useRef } from "react";

type Persona = "beginner" | "bargainer" | "expert";

interface ChatMessage {
  role: "ai" | "user";
  content: string;
}

interface UseFeynmanChatOptions {
  knowledgeId: string;
  persona: Persona;
}

interface UseFeynmanChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isComplete: boolean;
  isConvinced: boolean;
  roundNumber: number;
  evalSummary: string | null;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  startConversation: () => Promise<void>;
}

interface MetaData {
  isConvinced?: boolean;
  roundNumber?: number;
  isComplete?: boolean;
  evalSummary?: string;
}

const META_REGEX = /<!--META:(.*?)-->/;

function parseMeta(text: string): { cleanText: string; meta: MetaData | null } {
  const match = text.match(META_REGEX);
  if (!match) {
    return { cleanText: text, meta: null };
  }
  try {
    const meta = JSON.parse(match[1]) as MetaData;
    const cleanText = text.replace(META_REGEX, "").trim();
    return { cleanText, meta };
  } catch {
    return { cleanText: text, meta: null };
  }
}

async function readStream(
  response: Response,
  onChunk: (chunk: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let fullText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      onChunk(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

export function useFeynmanChat({
  knowledgeId,
  persona,
}: UseFeynmanChatOptions): UseFeynmanChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isConvinced, setIsConvinced] = useState(false);
  const [roundNumber, setRoundNumber] = useState(0);
  const [evalSummary, setEvalSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accumulatedRef = useRef("");

  const streamAiResponse = useCallback(
    async (chatHistory: ChatMessage[], userMessage: string) => {
      setIsLoading(true);
      setError(null);
      accumulatedRef.current = "";

      // Append placeholder AI message
      setMessages((prev) => [...prev, { role: "ai", content: "" }]);

      try {
        const res = await fetch("/api/feynman/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            knowledgeId,
            persona,
            chatHistory,
            userMessage,
          }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error ?? `Request failed (${res.status})`);
        }

        const fullText = await readStream(res, (chunk) => {
          accumulatedRef.current += chunk;
          const current = accumulatedRef.current;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "ai",
              content: current.replace(META_REGEX, "").trim(),
            };
            return updated;
          });
        });

        // Parse metadata from complete response
        const { cleanText, meta } = parseMeta(fullText);

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "ai", content: cleanText };
          return updated;
        });

        if (meta) {
          if (meta.roundNumber !== undefined) setRoundNumber(meta.roundNumber);
          if (meta.isConvinced !== undefined) setIsConvinced(meta.isConvinced);
          if (meta.isComplete !== undefined) setIsComplete(meta.isComplete);
          if (meta.evalSummary !== undefined) setEvalSummary(meta.evalSummary);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "发送消息失败";
        setError(message);
        // Remove empty AI placeholder on error
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "ai" && last.content === "") {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [knowledgeId, persona]
  );

  const startConversation = useCallback(async () => {
    await streamAiResponse([], "__START__");
  }, [streamAiResponse]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (isComplete || isLoading) return;

      const userMsg: ChatMessage = { role: "user", content: text };
      const updatedHistory = [...messages, userMsg];
      setMessages(updatedHistory);

      await streamAiResponse(updatedHistory, text);
    },
    [messages, isComplete, isLoading, streamAiResponse]
  );

  return {
    messages,
    isLoading,
    isComplete,
    isConvinced,
    roundNumber,
    evalSummary,
    error,
    sendMessage,
    startConversation,
  };
}
