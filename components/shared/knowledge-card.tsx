"use client";

import { useState } from "react";

interface KnowledgeCardProps {
  title: string;
  keyPoints: string[];
  content: string;
  examples: string | null;
  isFavorited: boolean;
  onToggleFavorite: () => void;
}

export function KnowledgeCard({
  title,
  keyPoints,
  content,
  examples,
  isFavorited,
  onToggleFavorite,
}: KnowledgeCardProps) {
  const [showExamples, setShowExamples] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-y-auto rounded-2xl bg-surface p-5 shadow-card">
      {/* 标题 + 收藏 */}
      <div className="mb-4 flex items-start justify-between">
        <h2 className="text-lg font-semibold text-text-primary pr-2">
          {title}
        </h2>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="shrink-0 text-xl transition-transform active:scale-125"
          aria-label={isFavorited ? "取消收藏" : "收藏"}
        >
          {isFavorited ? "⭐" : "☆"}
        </button>
      </div>

      {/* 核心要点 */}
      {Array.isArray(keyPoints) && keyPoints.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-primary-600">
            核心要点
          </h3>
          <ul className="space-y-1.5">
            {keyPoints.map((point, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-text-primary"
              >
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700">
                  {i + 1}
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 详细内容 */}
      <div className="mb-4">
        <h3 className="mb-1 text-sm font-medium text-text-secondary">
          详细说明
        </h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
          {content}
        </p>
      </div>

      {/* 案例话术 */}
      {examples && (
        <div>
          <button
            onClick={() => setShowExamples(!showExamples)}
            className="mb-1 text-sm font-medium text-primary-500 hover:text-primary-600"
          >
            {showExamples ? "收起案例 ▲" : "查看案例话术 ▼"}
          </button>
          {showExamples && (
            <div className="rounded-lg bg-primary-50 p-3">
              <p className="whitespace-pre-wrap text-sm text-text-primary">
                {examples}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
