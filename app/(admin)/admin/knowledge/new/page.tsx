import { KnowledgeForm } from "@/components/shared/knowledge-form";

export default function NewKnowledgePage() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-semibold text-text-primary">
          新建知识点
        </h1>
        <div className="rounded-lg border bg-surface p-6">
          <KnowledgeForm />
        </div>
      </div>
    </div>
  );
}
