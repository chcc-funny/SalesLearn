"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string;
  name: string;
  avatar: string;
  role: string;
  overallScore: number;
  learningCompletion: number;
  testAvgScore: number;
  feynmanScore: number;
  joinedAt: string;
  readyForDuty: boolean;
}

interface WeakCategory {
  category: string;
  avgScore: number;
}

// ---------------------------------------------------------------------------
// TODO: 替换为真实 API 调用 GET /api/admin/team
// ---------------------------------------------------------------------------

const MOCK_MEMBERS: readonly TeamMember[] = [
  {
    id: "1",
    name: "张三",
    avatar: "张",
    role: "销售顾问",
    overallScore: 92,
    learningCompletion: 95,
    testAvgScore: 88,
    feynmanScore: 93,
    joinedAt: "2025-11-15",
    readyForDuty: true,
  },
  {
    id: "2",
    name: "李四",
    avatar: "李",
    role: "销售顾问",
    overallScore: 85,
    learningCompletion: 80,
    testAvgScore: 82,
    feynmanScore: 90,
    joinedAt: "2026-01-03",
    readyForDuty: true,
  },
  {
    id: "3",
    name: "王五",
    avatar: "王",
    role: "实习销售",
    overallScore: 68,
    learningCompletion: 60,
    testAvgScore: 72,
    feynmanScore: 65,
    joinedAt: "2026-03-10",
    readyForDuty: false,
  },
  {
    id: "4",
    name: "赵六",
    avatar: "赵",
    role: "销售顾问",
    overallScore: 78,
    learningCompletion: 75,
    testAvgScore: 80,
    feynmanScore: 76,
    joinedAt: "2026-02-01",
    readyForDuty: true,
  },
  {
    id: "5",
    name: "孙七",
    avatar: "孙",
    role: "实习销售",
    overallScore: 55,
    learningCompletion: 45,
    testAvgScore: 60,
    feynmanScore: 50,
    joinedAt: "2026-04-01",
    readyForDuty: false,
  },
];

const MOCK_WEAK_CATEGORIES: readonly WeakCategory[] = [
  { category: "产品知识", avgScore: 82 },
  { category: "客户异议", avgScore: 65 },
  { category: "成交话术", avgScore: 70 },
  { category: "客户心理", avgScore: 58 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScoreColor(score: number): string {
  if (score >= 85) return "text-green-600";
  if (score >= 70) return "text-yellow-600";
  return "text-red-500";
}

function getBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 65) return "bg-yellow-500";
  return "bg-red-500";
}

function getRankBadge(index: number): string {
  if (index === 0) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  if (index === 1) return "bg-gray-100 text-gray-700 border-gray-300";
  if (index === 2) return "bg-orange-100 text-orange-700 border-orange-300";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MemberDetailPanel({
  member,
  onClose,
}: {
  readonly member: TeamMember;
  readonly onClose: () => void;
}) {
  return (
    <Card className="mt-4 border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{member.name} - 详细数据</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            收起
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ScoreCard label="综合评分" value={member.overallScore} />
          <ScoreCard label="学习完成度" value={member.learningCompletion} suffix="%" />
          <ScoreCard label="测试平均分" value={member.testAvgScore} />
          <ScoreCard label="费曼讲解分" value={member.feynmanScore} />
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-text-tertiary">
          <span>角色：{member.role}</span>
          <span>入职：{member.joinedAt}</span>
          <span>
            上岗状态：
            {member.readyForDuty ? (
              <Badge variant="default" className="ml-1">可上岗</Badge>
            ) : (
              <Badge variant="destructive" className="ml-1">待培训</Badge>
            )}
          </span>
        </div>

        {/* TODO: 接入 API 后添加个人成长曲线图表 */}
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-text-tertiary">
          个人成长曲线（待接入真实数据后展示折线图）
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreCard({
  label,
  value,
  suffix = "",
}: {
  readonly label: string;
  readonly value: number;
  readonly suffix?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-center">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${getScoreColor(value)}`}>
        {value}
        {suffix}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamDashboardPage() {
  const router = useRouter();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // TODO: 从 session 获取 tenantId，调用 GET /api/admin/team?tenantId=xxx
  const members = [...MOCK_MEMBERS].sort((a, b) => b.overallScore - a.overallScore);
  const weakCategories = MOCK_WEAK_CATEGORIES;

  const teamAvgScore =
    members.length > 0
      ? Math.round(members.reduce((sum, m) => sum + m.overallScore, 0) / members.length)
      : 0;
  const readyCount = members.filter((m) => m.readyForDuty).length;

  function handleMemberClick(id: string) {
    setSelectedMemberId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">团队看板</h1>
            <p className="text-sm text-text-secondary">
              共 {members.length} 名成员，{readyCount} 人可上岗
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/admin")}>
            返回管理后台
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-text-tertiary">团队人数</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{members.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-text-tertiary">团队平均分</p>
              <p className={`mt-1 text-2xl font-bold ${getScoreColor(teamAvgScore)}`}>
                {teamAvgScore}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-text-tertiary">可上岗人数</p>
              <p className="mt-1 text-2xl font-bold text-green-600">{readyCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-text-tertiary">待培训人数</p>
              <p className="mt-1 text-2xl font-bold text-red-500">
                {members.length - readyCount}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Ranking + Weak Categories */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Ranking List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">团队排行榜</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {members.map((member, index) => {
                  const isSelected = selectedMemberId === member.id;
                  return (
                    <div key={member.id}>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-4 rounded-lg p-3 text-left transition-colors hover:bg-slate-50 ${
                          isSelected ? "bg-slate-50 ring-1 ring-primary/30" : ""
                        }`}
                        onClick={() => handleMemberClick(member.id)}
                      >
                        {/* Rank */}
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${getRankBadge(index)}`}
                        >
                          {index + 1}
                        </span>

                        {/* Avatar */}
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                          {member.avatar}
                        </span>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">
                              {member.name}
                            </span>
                            {member.readyForDuty ? (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                可上岗
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                待培训
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-text-tertiary">{member.role}</p>
                        </div>

                        {/* Scores */}
                        <div className="hidden gap-6 text-center sm:flex">
                          <div>
                            <p className="text-[10px] text-text-tertiary">综合分</p>
                            <p className={`text-sm font-bold ${getScoreColor(member.overallScore)}`}>
                              {member.overallScore}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-text-tertiary">学习</p>
                            <p className={`text-sm font-bold ${getScoreColor(member.learningCompletion)}`}>
                              {member.learningCompletion}%
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-text-tertiary">测试</p>
                            <p className={`text-sm font-bold ${getScoreColor(member.testAvgScore)}`}>
                              {member.testAvgScore}
                            </p>
                          </div>
                        </div>

                        {/* Expand indicator */}
                        <span className="shrink-0 text-text-tertiary">
                          {isSelected ? "▲" : "▼"}
                        </span>
                      </button>

                      {isSelected && (
                        <MemberDetailPanel
                          member={member}
                          onClose={() => setSelectedMemberId(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Weak Categories */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">薄弱知识点分布</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {weakCategories.map((cat) => (
                  <div key={cat.category}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-text-secondary">{cat.category}</span>
                      <span className={`font-medium ${getScoreColor(cat.avgScore)}`}>
                        {cat.avgScore}分
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${getBarColor(cat.avgScore)}`}
                        style={{ width: `${cat.avgScore}%` }}
                      />
                    </div>
                  </div>
                ))}

                {/* TODO: 接入真实 API 后移除 mock 提示 */}
                <p className="mt-4 text-center text-xs text-text-tertiary">
                  数据基于团队全部测试记录
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
