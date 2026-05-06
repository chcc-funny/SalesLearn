import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Smoke test：员工端 /scripts 页面（unit29）
 *
 * 不做完整 E2E（最终 Playwright 单独跑）。
 * 验证：
 *  - 页面能在 fetch mock 下渲染
 *  - 标签 + 列表两个接口正确调用（路径包含 /api/scripts/tags 与 /api/scripts）
 *  - 列表数据被渲染为卡片
 *  - 错误响应时显示 error 区域
 */

// next/navigation mock
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// sonner mock：避免在 happy-dom 下因 portal 报错
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const ORIGINAL_FETCH = global.fetch;

function mockFetch(impl: (url: string) => Promise<Response> | Response) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    return impl(url);
  }) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("员工端 /scripts 页面（unit29）", () => {
  it("正常渲染页面框架（标题 + 筛选 + 导航）", async () => {
    mockFetch((url) => {
      if (url.includes("/api/scripts/tags")) {
        return jsonResponse({
          success: true,
          data: { scene: [], product: [] },
        });
      }
      if (url.includes("/api/scripts")) {
        return jsonResponse({
          success: true,
          data: [],
          meta: { total: 0, page: 1, limit: 30 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    const { default: Page } = await import(
      "@/app/(employee)/scripts/page"
    );
    render(<Page />);

    expect(screen.getByText("精选话术")).toBeInTheDocument();
    // 等待 loading 结束
    await waitFor(() => {
      expect(screen.queryByText(/加载中/)).not.toBeInTheDocument();
    });
    // 空态文案
    expect(
      screen.getByText(/没有匹配的话术|暂无话术/)
    ).toBeInTheDocument();
  });

  it("列表数据渲染为卡片", async () => {
    mockFetch((url) => {
      if (url.includes("/api/scripts/tags")) {
        return jsonResponse({
          success: true,
          data: {
            scene: [{ id: "s1", name: "进店问询", groupKey: "scene" }],
            product: [{ id: "p1", name: "隔热膜", groupKey: "product" }],
          },
        });
      }
      if (url.includes("/api/scripts")) {
        return jsonResponse({
          success: true,
          data: [
            {
              id: "id-1",
              title: "镀膜质保答疑",
              customerQuestion: "镀膜能保多久？",
              answer: "12-18 个月。",
              status: "published",
              usageCount: 7,
            },
          ],
          meta: { total: 1, page: 1, limit: 30 },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    const { default: Page } = await import(
      "@/app/(employee)/scripts/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("镀膜质保答疑")).toBeInTheDocument();
    });
    expect(screen.getByText(/镀膜能保多久/)).toBeInTheDocument();
    // 标签筛选区也应该渲染了「进店问询」/「隔热膜」
    expect(screen.getByText("进店问询")).toBeInTheDocument();
    expect(screen.getByText("隔热膜")).toBeInTheDocument();
  });

  it("列表 API 失败时显示错误信息", async () => {
    mockFetch((url) => {
      if (url.includes("/api/scripts/tags")) {
        return jsonResponse({
          success: true,
          data: { scene: [], product: [] },
        });
      }
      if (url.includes("/api/scripts")) {
        return jsonResponse(
          { success: false, error: "服务暂不可用" },
          500
        );
      }
      return jsonResponse({ success: false }, 404);
    });

    const { default: Page } = await import(
      "@/app/(employee)/scripts/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/服务暂不可用/)).toBeInTheDocument();
  });
});
