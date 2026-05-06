import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScriptList } from "@/components/scripts/script-list";
import type { ScriptCardData } from "@/components/scripts/script-card";

/**
 * 单元测试：ScriptList（unit28 - 列表组件）
 *
 * 覆盖：
 *  - loading / empty / error 三态切换
 *  - 数据渲染：每个 script 渲染为一张 ScriptCard
 *  - onCopy 透传到卡片，卡片点击复制按钮可触发
 *  - 用 userEvent 而非 fireEvent
 */

function makeScript(
  overrides: Partial<ScriptCardData> = {}
): ScriptCardData {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "镀膜质保答疑",
    customerQuestion: "镀膜能保多久？",
    answer: "正常使用条件下质保 12-18 个月。",
    status: "published",
    usageCount: 10,
    tags: [],
    ...overrides,
  };
}

describe("ScriptList 组件", () => {
  describe("loading 状态", () => {
    it("isLoading=true 时显示加载提示", () => {
      render(<ScriptList scripts={[]} isLoading />);
      expect(screen.getByText(/加载中/)).toBeInTheDocument();
    });

    it("isLoading=true 时不渲染任何卡片", () => {
      render(
        <ScriptList
          scripts={[makeScript({ id: "a", title: "标题A" })]}
          isLoading
        />
      );
      expect(screen.queryByText("标题A")).not.toBeInTheDocument();
    });

    it("isLoading=true 时即使有 error 也优先显示加载", () => {
      render(<ScriptList scripts={[]} isLoading error="网络错误" />);
      expect(screen.getByText(/加载中/)).toBeInTheDocument();
      expect(screen.queryByText(/网络错误/)).not.toBeInTheDocument();
    });
  });

  describe("error 状态", () => {
    it("有 error 且 isLoading=false 时显示错误信息", () => {
      render(<ScriptList scripts={[]} error="网络错误" />);
      expect(screen.getByText(/网络错误/)).toBeInTheDocument();
    });

    it("error 状态下不渲染卡片", () => {
      render(
        <ScriptList
          scripts={[makeScript({ id: "a", title: "标题A" })]}
          error="网络错误"
        />
      );
      expect(screen.queryByText("标题A")).not.toBeInTheDocument();
    });

    it("error 区域有 role=alert 便于辅助技术", () => {
      render(<ScriptList scripts={[]} error="网络错误" />);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("网络错误");
    });
  });

  describe("empty 状态", () => {
    it("scripts=[] 且无 error 时显示空态文案", () => {
      render(<ScriptList scripts={[]} />);
      expect(screen.getByText(/暂无话术/)).toBeInTheDocument();
    });

    it("自定义 emptyText 覆盖默认文案", () => {
      render(
        <ScriptList scripts={[]} emptyText="筛选条件下没有结果" />
      );
      expect(screen.getByText("筛选条件下没有结果")).toBeInTheDocument();
    });

    it("空态时不渲染任何卡片（role=article）", () => {
      render(<ScriptList scripts={[]} />);
      expect(screen.queryByRole("article")).not.toBeInTheDocument();
    });
  });

  describe("数据渲染", () => {
    it("每个 script 渲染为一张卡片", () => {
      const scripts = [
        makeScript({ id: "id-1", title: "标题1" }),
        makeScript({ id: "id-2", title: "标题2" }),
      ];
      render(<ScriptList scripts={scripts} />);
      expect(screen.getByText("标题1")).toBeInTheDocument();
      expect(screen.getByText("标题2")).toBeInTheDocument();
      expect(screen.getAllByRole("article")).toHaveLength(2);
    });

    it("无 onCopy 时点击复制按钮不抛错", async () => {
      const user = userEvent.setup();
      render(
        <ScriptList scripts={[makeScript({ id: "id-1", title: "T" })]} />
      );
      const btn = screen.getByRole("button", { name: /复制/ });
      await user.click(btn);
      // 不抛错即通过
    });
  });

  describe("onCopy 透传", () => {
    it("点击卡片的复制按钮触发 onCopy 回调", async () => {
      const user = userEvent.setup();
      const onCopy = vi.fn();
      const script = makeScript({ id: "id-1", title: "标题1" });
      render(<ScriptList scripts={[script]} onCopy={onCopy} />);
      const btn = screen.getByRole("button", { name: /复制/ });
      await user.click(btn);
      expect(onCopy).toHaveBeenCalledTimes(1);
      expect(onCopy).toHaveBeenCalledWith(script);
    });

    it("多张卡片各自的复制按钮触发不同 script", async () => {
      const user = userEvent.setup();
      const onCopy = vi.fn();
      const scripts = [
        makeScript({ id: "id-1", title: "标题1" }),
        makeScript({ id: "id-2", title: "标题2" }),
      ];
      render(<ScriptList scripts={scripts} onCopy={onCopy} />);
      const buttons = screen.getAllByRole("button", { name: /复制/ });
      await user.click(buttons[1]);
      expect(onCopy).toHaveBeenCalledTimes(1);
      expect(onCopy).toHaveBeenCalledWith(scripts[1]);
    });
  });

  describe("管理端模式", () => {
    it("showStatusBadge=true 时卡片显示状态徽章", () => {
      render(
        <ScriptList
          scripts={[
            makeScript({ id: "id-1", title: "T", status: "draft" }),
          ]}
          showStatusBadge
        />
      );
      expect(screen.getByText("草稿")).toBeInTheDocument();
    });
  });
});
