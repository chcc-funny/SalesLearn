import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Harness Batch12 smoke test：
 *  - unit35: app/(admin)/admin/knowledge/[id]/page.tsx
 *
 * 验证 page 模块可被 import 且默认导出为 function 组件，
 * 同时验证「标记为精选话术」按钮元素能渲染。
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "11111111-1111-4111-8111-aaaaaaaaaaaa" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import KnowledgeDetailPage from "@/app/(admin)/admin/knowledge/[id]/page";

const FAKE_DETAIL = {
  id: "11111111-1111-4111-8111-aaaaaaaaaaaa",
  title: "测试知识点",
  category: "product",
  keyPoints: ["要点1", "要点2"],
  content: "正文内容",
  examples: "示例",
  commonMistakes: "常见错误",
  status: "reviewing",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Harness Batch12 - admin knowledge [id] page smoke", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: string) => {
      if (typeof url === "string" && url.includes("/api/knowledge/")) {
        return new Response(
          JSON.stringify({ success: true, data: FAKE_DETAIL }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("admin/knowledge/[id]/page.tsx default export is a function", () => {
    expect(typeof KnowledgeDetailPage).toBe("function");
  });

  it("renders 标记为精选话术 button after data loads", async () => {
    render(<KnowledgeDetailPage />);
    const btn = await waitFor(() =>
      screen.getByRole("button", { name: "标记为精选话术" })
    );
    expect(btn).toBeTruthy();
  });

  it("renders 返回列表 button (header) after data loads", async () => {
    render(<KnowledgeDetailPage />);
    const buttons = await waitFor(() => screen.getAllByRole("button", { name: "返回列表" }));
    expect(buttons.length).toBeGreaterThan(0);
  });
});
