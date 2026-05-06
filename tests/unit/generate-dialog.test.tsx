import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * 单元测试：生成弹窗组件 GenerateDialog（unit46）
 *
 * 覆盖：
 *  - 关闭态：不渲染对话框正文
 *  - 打开态：渲染表单（textarea / 生成按钮 / 字数计数）
 *  - 输入超 500 字：前端按钮禁用 + 错误提示
 *  - 点击生成：POST /api/scripts/generate；loading 态展示
 *  - 命中 curated：渲染 top-3 候选；source badge=精选
 *  - 命中 mixed：候选 + 生成 draft；生成卡片有「提交审核」按钮
 *  - 命中 generated：仅 draft；显示 source badge=AI
 *  - 命中 empty：渲染空态文案
 *  - 候选「复制」按钮回调：写剪贴板 + 不调 submit API
 *  - 「提交审核」按钮：POST /api/scripts/submit；带 requestId
 *  - 提交失败 API：toast 错误
 *  - 网络错 fetch reject：显示错误态
 *  - 关闭按钮：触发 onClose 回调
 *  - a11y：dialog role + 关闭按钮 aria-label
 */

// sonner mock
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { GenerateDialog } from "@/components/scripts/generate-dialog";
import { toast } from "sonner";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_ID = "22222222-2222-4222-8222-222222222222";

const ORIGINAL_FETCH = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    return impl(url, init);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

const curatedItem = {
  id: "script-1",
  title: "贴膜推荐",
  customerQuestion: "贴膜什么牌子好",
  answer: "推荐量子膜，性价比最高，质保 10 年。",
  score: 0.95,
};

const generatedItem = {
  id: "generated:0",
  title: "AI - 贴膜推荐",
  customerQuestion: "贴膜什么牌子好",
  answer: "AI 生成：建议选择量子膜系列。",
  score: 0,
  isGenerated: true,
  sourceIds: ["kb-1"],
};

describe("GenerateDialog（unit46）", () => {
  it("open=false 时不渲染对话框", () => {
    render(<GenerateDialog open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("open=true：渲染对话框 + 表单元素 + a11y role", () => {
    render(<GenerateDialog open onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /客户问题/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成|获取答案/ })).toBeInTheDocument();
  });

  it("点击关闭按钮：触发 onClose", async () => {
    const onClose = vi.fn();
    render(<GenerateDialog open onClose={onClose} />);
    const closeBtn = screen.getByRole("button", { name: /关闭/ });
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape 键关闭对话框", async () => {
    const onClose = vi.fn();
    render(<GenerateDialog open onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("输入超 500 字：错误提示 + 按钮禁用", async () => {
    render(<GenerateDialog open onClose={() => {}} />);
    const ta = screen.getByRole("textbox", { name: /客户问题/ });
    await userEvent.type(ta, "x".repeat(501));

    const btn = screen.getByRole("button", { name: /生成|获取答案/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/不能超过.*500/)).toBeInTheDocument();
  });

  it("空输入：生成按钮禁用", () => {
    render(<GenerateDialog open onClose={() => {}} />);
    const btn = screen.getByRole("button", { name: /生成|获取答案/ });
    expect(btn).toBeDisabled();
  });

  it("点击生成 - curated 命中：渲染 top-3 + source badge=精选", async () => {
    mockFetch((url) => {
      if (url.includes("/api/scripts/generate")) {
        return jsonResponse({
          success: true,
          data: {
            source: "curated",
            items: [
              curatedItem,
              { ...curatedItem, id: "script-2", title: "膜的差异" },
              { ...curatedItem, id: "script-3", title: "贴膜流程" },
            ],
          },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    render(<GenerateDialog open onClose={() => {}} />);
    const ta = screen.getByRole("textbox", { name: /客户问题/ });
    await userEvent.type(ta, "贴膜什么牌子好");
    await userEvent.click(screen.getByRole("button", { name: /生成|获取答案/ }));

    await waitFor(() => {
      expect(screen.getByText("贴膜推荐")).toBeInTheDocument();
    });
    // 三条 curated 全部渲染
    expect(screen.getByText("膜的差异")).toBeInTheDocument();
    expect(screen.getByText("贴膜流程")).toBeInTheDocument();
    // source badge：至少有"精选"或 curated 字样
    expect(screen.getAllByText(/精选/).length).toBeGreaterThan(0);
  });

  it("点击生成 - generated：仅 draft + AI 徽标 + 提交审核按钮", async () => {
    mockFetch((url) => {
      if (url.includes("/api/scripts/generate")) {
        return jsonResponse({
          success: true,
          data: {
            source: "generated",
            items: [generatedItem],
          },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    render(<GenerateDialog open onClose={() => {}} />);
    const ta = screen.getByRole("textbox", { name: /客户问题/ });
    await userEvent.type(ta, "贴膜什么牌子好");
    await userEvent.click(screen.getByRole("button", { name: /生成|获取答案/ }));

    await waitFor(() => {
      expect(screen.getByText("AI - 贴膜推荐")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/AI/).length).toBeGreaterThan(0);
    // generated 卡片必须有「提交审核」按钮
    expect(
      screen.getByRole("button", { name: /提交审核|提交主管/ })
    ).toBeInTheDocument();
  });

  it("点击生成 - mixed：候选 + AI draft 混合渲染", async () => {
    mockFetch((url) => {
      if (url.includes("/api/scripts/generate")) {
        return jsonResponse({
          success: true,
          data: {
            source: "mixed",
            items: [curatedItem, generatedItem],
          },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    render(<GenerateDialog open onClose={() => {}} />);
    const ta = screen.getByRole("textbox", { name: /客户问题/ });
    await userEvent.type(ta, "贴膜");
    await userEvent.click(screen.getByRole("button", { name: /生成|获取答案/ }));

    await waitFor(() => {
      expect(screen.getByText("贴膜推荐")).toBeInTheDocument();
    });
    expect(screen.getByText("AI - 贴膜推荐")).toBeInTheDocument();
    // 仅 generated 卡片有提交按钮
    expect(
      screen.getAllByRole("button", { name: /提交审核|提交主管/ }).length
    ).toBe(1);
  });

  it("点击生成 - empty：渲染空态文案", async () => {
    mockFetch((url) => {
      if (url.includes("/api/scripts/generate")) {
        return jsonResponse({
          success: true,
          data: { source: "empty", items: [] },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    render(<GenerateDialog open onClose={() => {}} />);
    const ta = screen.getByRole("textbox", { name: /客户问题/ });
    await userEvent.type(ta, "测试");
    await userEvent.click(screen.getByRole("button", { name: /生成|获取答案/ }));

    await waitFor(() => {
      expect(screen.getByText(/暂未找到|未生成|没有结果/)).toBeInTheDocument();
    });
  });

  it("生成期间：按钮禁用 + 显示加载文案", async () => {
    let resolveFetch: (v: Response) => void = () => {};
    mockFetch(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r;
        })
    );

    render(<GenerateDialog open onClose={() => {}} />);
    const ta = screen.getByRole("textbox", { name: /客户问题/ });
    await userEvent.type(ta, "贴膜");
    await userEvent.click(screen.getByRole("button", { name: /生成|获取答案/ }));

    expect(screen.getByRole("button", { name: /生成中|加载/ })).toBeDisabled();

    // cleanup：resolve 让组件不挂起
    resolveFetch(
      jsonResponse({ success: true, data: { source: "empty", items: [] } })
    );
    await waitFor(() => {
      expect(screen.getByText(/暂未找到|未生成|没有结果/)).toBeInTheDocument();
    });
  });

  it("API 返回 success=false：显示错误态 + toast.error", async () => {
    mockFetch(() =>
      jsonResponse({ success: false, error: "AI 暂不可用" }, 200)
    );

    render(<GenerateDialog open onClose={() => {}} />);
    const ta = screen.getByRole("textbox", { name: /客户问题/ });
    await userEvent.type(ta, "贴膜");
    await userEvent.click(screen.getByRole("button", { name: /生成|获取答案/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("fetch 抛错（网络异常）：显示错误态", async () => {
    mockFetch(() => Promise.reject(new Error("network")));

    render(<GenerateDialog open onClose={() => {}} />);
    const ta = screen.getByRole("textbox", { name: /客户问题/ });
    await userEvent.type(ta, "贴膜");
    await userEvent.click(screen.getByRole("button", { name: /生成|获取答案/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("候选卡片复制按钮：写剪贴板 + toast.success（不调 submit）", async () => {
    let submitCalled = false;
    mockFetch((url) => {
      if (url.includes("/api/scripts/generate")) {
        return jsonResponse({
          success: true,
          data: { source: "curated", items: [curatedItem] },
        });
      }
      if (url.includes("/api/scripts/submit")) {
        submitCalled = true;
        return jsonResponse({ success: true });
      }
      return jsonResponse({ success: false }, 404);
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<GenerateDialog open onClose={() => {}} />);
    const ta = screen.getByRole("textbox", { name: /客户问题/ });
    await userEvent.type(ta, "贴膜");
    await userEvent.click(screen.getByRole("button", { name: /生成|获取答案/ }));

    await waitFor(() => {
      expect(screen.getByText("贴膜推荐")).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole("button", { name: /复制/ });
    await userEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(curatedItem.answer);
    });
    expect(toast.success).toHaveBeenCalled();
    expect(submitCalled).toBe(false);
  });

  it("提交审核按钮：POST /api/scripts/submit + 带 requestId + 成功后 onSubmitted 回调", async () => {
    let submitBody: unknown = null;
    mockFetch((url, init) => {
      if (url.includes("/api/scripts/generate")) {
        return jsonResponse({
          success: true,
          data: {
            source: "generated",
            items: [generatedItem],
            requestId: REQUEST_ID,
          },
        });
      }
      if (url.includes("/api/scripts/submit")) {
        submitBody = init?.body ? JSON.parse(init.body as string) : null;
        return jsonResponse({
          success: true,
          data: { id: SCRIPT_ID, status: "pending_review" },
        });
      }
      return jsonResponse({ success: false }, 404);
    });

    const onSubmitted = vi.fn();
    render(<GenerateDialog open onClose={() => {}} onSubmitted={onSubmitted} />);
    const ta = screen.getByRole("textbox", { name: /客户问题/ });
    await userEvent.type(ta, "贴膜什么牌子好");
    await userEvent.click(screen.getByRole("button", { name: /生成|获取答案/ }));

    await waitFor(() => {
      expect(screen.getByText("AI - 贴膜推荐")).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: /提交审核|提交主管/ });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });

    expect(submitBody).toBeTruthy();
    const body = submitBody as Record<string, unknown>;
    // 必含 title / customerQuestion / answer
    expect(body.title).toBe(generatedItem.title);
    expect(body.customerQuestion).toBeTruthy();
    expect(body.answer).toBe(generatedItem.answer);
    // requestId 字段必须存在（用于幂等）
    expect(typeof body.requestId).toBe("string");
    expect((body.requestId as string).length).toBeGreaterThan(0);

    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it("提交审核失败：API success=false → toast.error + 不调 onSubmitted", async () => {
    mockFetch((url) => {
      if (url.includes("/api/scripts/generate")) {
        return jsonResponse({
          success: true,
          data: {
            source: "generated",
            items: [generatedItem],
          },
        });
      }
      if (url.includes("/api/scripts/submit")) {
        return jsonResponse({ success: false, error: "提交失败" }, 500);
      }
      return jsonResponse({ success: false }, 404);
    });

    const onSubmitted = vi.fn();
    render(<GenerateDialog open onClose={() => {}} onSubmitted={onSubmitted} />);
    const ta = screen.getByRole("textbox", { name: /客户问题/ });
    await userEvent.type(ta, "贴膜");
    await userEvent.click(screen.getByRole("button", { name: /生成|获取答案/ }));

    await waitFor(() => {
      expect(screen.getByText("AI - 贴膜推荐")).toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByRole("button", { name: /提交审核|提交主管/ })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("初始 customerQuestion 预填：打开后 textarea 已带值", () => {
    render(
      <GenerateDialog
        open
        onClose={() => {}}
        initialQuestion="预填的客户问题"
      />
    );
    const ta = screen.getByRole("textbox", {
      name: /客户问题/,
    }) as HTMLTextAreaElement;
    expect(ta.value).toBe("预填的客户问题");
  });
});
