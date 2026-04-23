"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FeynmanChat } from "@/components/shared/feynman-chat";
import { FeynmanChatResult } from "@/components/shared/feynman-chat-result";

type Persona = "beginner" | "bargainer" | "expert";
type PagePhase = "loading" | "locked" | "selecting" | "chatting" | "result";

interface ChatResult {
  isConvinced: boolean;
  evalSummary: string | null;
  chatHistory: Array<{ role: "ai" | "user"; content: string }>;
}

interface PersonaOption {
  id: Persona;
  name: string;
  description: string;
  difficulty: string;
  difficultyColor: string;
}

const PERSONA_OPTIONS: PersonaOption[] = [
  {
    id: "beginner",
    name: "小白客户",
    description: "什么都不懂，需要你从头解释产品优势和必要性",
    difficulty: "简单",
    difficultyColor: "text-green-600 bg-green-50",
  },
  {
    id: "bargainer",
    name: "比价客户",
    description: "货比三家，会质疑价格、对比竞品，需要你突出性价比",
    difficulty: "中等",
    difficultyColor: "text-yellow-600 bg-yellow-50",
  },
  {
    id: "expert",
    name: "懂车客户",
    description: "有专业知识，会提出技术问题，需要你展示专业深度",
    difficulty: "困难",
    difficultyColor: "text-red-600 bg-red-50",
  },
];

function PersonaCard({
  option,
  onSelect,
}: {
  option: PersonaOption;
  onSelect: (id: Persona) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(option.id);
  }, [option.id, onSelect]);

  return (
    <Card
      className="cursor-pointer border-2 border-transparent p-4 transition-all hover:border-[#7C3AED]/40 hover:shadow-md"
      onClick={handleClick}
    >
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          {option.name}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${option.difficultyColor}`}
        >
          {option.difficulty}
        </span>
      </div>
      <p className="mt-2 text-xs text-text-secondary leading-relaxed">
        {option.description}
      </p>
    </Card>
  );
}

function PersonaSelection({
  onSelect,
}: {
  onSelect: (persona: Persona) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <Badge className="border-transparent bg-[#7C3AED]/10 text-[#7C3AED] hover:bg-[#7C3AED]/20 mb-3">
          阶段 B · AI 客户追问
        </Badge>
        <h2 className="text-lg font-semibold text-text-primary">
          选择客户角色
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          AI 将扮演不同类型的客户向你提问，考验你的应变能力
        </p>
      </div>
      <div className="space-y-3">
        {PERSONA_OPTIONS.map((opt) => (
          <PersonaCard key={opt.id} option={opt} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}


export default function FeynmanChatPage() {
  const params = useParams<{ knowledgeId: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<PagePhase>("loading");
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [chatResult, setChatResult] = useState<ChatResult | null>(null);

  // Load knowledge title and check unlock status
  useEffect(() => {
    async function init() {
      try {
        const [knowledgeRes, recordsRes] = await Promise.all([
          fetch(`/api/knowledge/${params.knowledgeId}`),
          fetch(`/api/feynman/records?knowledgeId=${params.knowledgeId}`),
        ]);

        const knowledgeJson = await knowledgeRes.json();
        if (!knowledgeJson.success) {
          setPhase("locked");
          return;
        }
        setKnowledgeTitle(knowledgeJson.data.title ?? "");

        const recordsJson = await recordsRes.json();
        const hasQualified = checkStageBUnlock(recordsJson);

        setPhase(hasQualified ? "selecting" : "locked");
      } catch {
        setPhase("locked");
      }
    }
    init();
  }, [params.knowledgeId]);

  const handlePersonaSelect = useCallback((persona: Persona) => {
    setSelectedPersona(persona);
    setPhase("chatting");
  }, []);

  const handleChatComplete = useCallback((result: ChatResult) => {
    setChatResult(result);
    setPhase("result");
  }, []);

  const handleBack = useCallback(() => {
    router.push("/feynman");
  }, [router]);

  const handleBackToSelect = useCallback(() => {
    setSelectedPersona(null);
    setChatResult(null);
    setPhase("selecting");
  }, []);

  // Loading
  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-tertiary text-sm">加载中...</p>
      </div>
    );
  }

  // Locked - Stage A score < 80
  if (phase === "locked") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4 px-4">
        <div className="text-center">
          <p className="text-3xl mb-3">🔒</p>
          <p className="text-sm font-medium text-text-primary">
            阶段 B 尚未解锁
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            需要在阶段 A 获得 80 分以上才能进入 AI 客户追问
          </p>
        </div>
        <Button variant="outline" onClick={handleBack}>
          返回列表
        </Button>
      </div>
    );
  }

  // Chatting - full screen chat
  if (phase === "chatting" && selectedPersona) {
    return (
      <div className="h-screen bg-background">
        <FeynmanChat
          knowledgeId={params.knowledgeId}
          knowledgeTitle={knowledgeTitle}
          persona={selectedPersona}
          onComplete={handleChatComplete}
          onBack={handleBackToSelect}
        />
      </div>
    );
  }

  // Selecting or Result
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <div className="border-b bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <button
            onClick={handleBack}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            ← 返回
          </button>
          <span className="text-xs text-text-tertiary truncate max-w-[200px]">
            {knowledgeTitle}
          </span>
        </div>
      </div>

      <div className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-lg">
          {phase === "selecting" && (
            <PersonaSelection onSelect={handlePersonaSelect} />
          )}
          {phase === "result" && chatResult && selectedPersona && (
            <FeynmanChatResult
              isConvinced={chatResult.isConvinced}
              evalSummary={chatResult.evalSummary}
              chatHistory={chatResult.chatHistory}
              persona={selectedPersona}
              roundCount={chatResult.chatHistory.filter((m) => m.role === "ai").length}
              onRetry={() => {
                setChatResult(null);
                setPhase("chatting");
              }}
              onChangePersona={handleBackToSelect}
              onBack={handleBack}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Check if any Stage A record has score >= 80 */
function checkStageBUnlock(recordsJson: {
  success: boolean;
  data?: Array<{ totalScore?: number; total_score?: number; stage?: string }>;
}): boolean {
  if (!recordsJson.success || !Array.isArray(recordsJson.data)) {
    return false;
  }
  return recordsJson.data.some((record) => {
    const score = record.totalScore ?? record.total_score ?? 0;
    const stage = record.stage ?? "a";
    return stage.toLowerCase() === "a" && score >= 80;
  });
}
