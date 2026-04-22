"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface KnowledgeFormData {
  title: string;
  category: string;
  keyPoints: string[];
  content: string;
  examples: string;
  commonMistakes: string;
}

interface KnowledgeFormProps {
  initialData?: Partial<KnowledgeFormData>;
  knowledgeId?: string;
}

const CATEGORIES = [
  { value: "product", label: "产品知识" },
  { value: "objection", label: "客户异议" },
  { value: "closing", label: "成交话术" },
  { value: "psychology", label: "客户心理" },
];

export function KnowledgeForm({ initialData, knowledgeId }: KnowledgeFormProps) {
  const router = useRouter();
  const isEdit = !!knowledgeId;

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [category, setCategory] = useState(initialData?.category ?? "product");
  const [keyPointsText, setKeyPointsText] = useState(
    initialData?.keyPoints?.join("\n") ?? ""
  );
  const [content, setContent] = useState(initialData?.content ?? "");
  const [examples, setExamples] = useState(initialData?.examples ?? "");
  const [commonMistakes, setCommonMistakes] = useState(
    initialData?.commonMistakes ?? ""
  );
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const keyPoints = keyPointsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const body = {
      title,
      category,
      keyPoints,
      content,
      examples: examples || undefined,
      commonMistakes: commonMistakes || undefined,
    };

    try {
      const url = isEdit ? `/api/knowledge/${knowledgeId}` : "/api/knowledge";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? "保存失败");
        return;
      }

      router.push("/admin/knowledge");
      router.refresh();
    } catch {
      setError("保存失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="请输入知识点标题"
          required
          disabled={isLoading}
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">分类</Label>
        <Select value={category} onValueChange={setCategory} disabled={isLoading}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="keyPoints">核心要点（每行一个）</Label>
        <Textarea
          id="keyPoints"
          value={keyPointsText}
          onChange={(e) => setKeyPointsText(e.target.value)}
          placeholder={"要点1\n要点2\n要点3"}
          rows={4}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">详细内容</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="请输入知识点详细说明"
          rows={8}
          required
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="examples">案例/话术示例（选填）</Label>
        <Textarea
          id="examples"
          value={examples}
          onChange={(e) => setExamples(e.target.value)}
          placeholder="客户问：...\n回答：..."
          rows={4}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="commonMistakes">常见误区（选填）</Label>
        <Textarea
          id="commonMistakes"
          value={commonMistakes}
          onChange={(e) => setCommonMistakes(e.target.value)}
          placeholder="误区1：..."
          rows={3}
          disabled={isLoading}
        />
      </div>

      {error && (
        <div className="rounded-md bg-error-bg px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          className="bg-primary-500 hover:bg-primary-600"
          disabled={isLoading}
        >
          {isLoading ? "保存中..." : isEdit ? "更新" : "创建"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          取消
        </Button>
      </div>
    </form>
  );
}
