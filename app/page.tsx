export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold text-text-primary mb-4">
          SalesLearn
        </h1>
        <p className="text-lg text-text-secondary mb-8">
          基于费曼学习法的 AI 销售培训系统
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-primary-500 px-6 py-3 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
          >
            开始学习
          </a>
        </div>
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="p-4 rounded-lg bg-surface shadow-card">
            <div className="text-2xl font-bold text-primary-500">知识库</div>
            <p className="text-sm text-text-tertiary mt-1">AI 智能切分</p>
          </div>
          <div className="p-4 rounded-lg bg-surface shadow-card">
            <div className="text-2xl font-bold text-info">卡片学习</div>
            <p className="text-sm text-text-tertiary mt-1">图文浏览</p>
          </div>
          <div className="p-4 rounded-lg bg-surface shadow-card">
            <div className="text-2xl font-bold text-success">测试练习</div>
            <p className="text-sm text-text-tertiary mt-1">AI 智能出题</p>
          </div>
          <div className="p-4 rounded-lg bg-surface shadow-card">
            <div className="text-2xl font-bold text-feynman-b">费曼讲解</div>
            <p className="text-sm text-text-tertiary mt-1">语音 + AI 评分</p>
          </div>
        </div>
      </div>
    </main>
  );
}
