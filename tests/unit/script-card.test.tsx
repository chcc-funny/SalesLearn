import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScriptCard, type ScriptCardData } from "@/components/scripts/script-card";

/**
 * 单元测试：ScriptCard 卡片组件（unit27）
 *
 * 覆盖：
 *  - 基础渲染：标题 / 客户问题 / 答案预览
 *  - 标签胶囊渲染（场景 + 产品）
 *  - 复制次数展示
 *  - 状态徽章（published / draft / pending_review / rejected / archived）
 *  - 复制按钮点击触发 onCopy 回调
 *  - 无标签 / 无场景 / 无产品 时的回退渲染
 */

const SCENE_TAG = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "进店问询",
  groupKey: "scene" as const,
};
const PRODUCT_TAG = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "镀膜",
  groupKey: "product" as const,
};

function makeScript(overrides: Partial<ScriptCardData> = {}): ScriptCardData {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "镀膜 12 个月质保答疑",
    customerQuestion: "镀膜能保多久？",
    answer:
      "我们的高端镀膜在正常使用条件下质保 12-18 个月，期间出现脱膜可免费补做。",
    status: "published",
    usageCount: 42,
    tags: [SCENE_TAG, PRODUCT_TAG],
    ...overrides,
  };
}

describe("ScriptCard 组件", () => {
  describe("基础渲染", () => {
    it("渲染标题", () => {
      render(<ScriptCard script={makeScript()} />);
      expect(screen.getByText("镀膜 12 个月质保答疑")).toBeInTheDocument();
    });

    it("渲染客户问题（customer question）", () => {
      render(<ScriptCard script={makeScript()} />);
      expect(screen.getByText(/镀膜能保多久/)).toBeInTheDocument();
    });

    it("渲染答案内容预览", () => {
      render(<ScriptCard script={makeScript()} />);
      expect(screen.getByText(/质保 12-18 个月/)).toBeInTheDocument();
    });

    it("展示复制次数（usageCount）", () => {
      render(<ScriptCard script={makeScript({ usageCount: 88 })} />);
      expect(screen.getByText(/88/)).toBeInTheDocument();
    });

    it("usageCount=0 也正常显示", () => {
      render(<ScriptCard script={makeScript({ usageCount: 0 })} />);
      expect(screen.getByText(/0/)).toBeInTheDocument();
    });
  });

  describe("标签胶囊", () => {
    it("渲染所有标签名（场景 + 产品）", () => {
      render(<ScriptCard script={makeScript()} />);
      expect(screen.getByText("进店问询")).toBeInTheDocument();
      expect(screen.getByText("镀膜")).toBeInTheDocument();
    });

    it("无标签时不渲染标签区域（也不抛错）", () => {
      render(<ScriptCard script={makeScript({ tags: [] })} />);
      // 仅验证标签名不存在；不强制要求隐藏整段容器
      expect(screen.queryByText("进店问询")).not.toBeInTheDocument();
      expect(screen.queryByText("镀膜")).not.toBeInTheDocument();
    });

    it("仅有场景标签时只渲染场景", () => {
      render(<ScriptCard script={makeScript({ tags: [SCENE_TAG] })} />);
      expect(screen.getByText("进店问询")).toBeInTheDocument();
      expect(screen.queryByText("镀膜")).not.toBeInTheDocument();
    });

    it("仅有产品标签时只渲染产品", () => {
      render(<ScriptCard script={makeScript({ tags: [PRODUCT_TAG] })} />);
      expect(screen.getByText("镀膜")).toBeInTheDocument();
      expect(screen.queryByText("进店问询")).not.toBeInTheDocument();
    });
  });

  describe("状态徽章", () => {
    it("status=published 时不显示「已发布」徽章（员工端默认）", () => {
      // 员工端列表只展示 published，故默认隐藏徽章；管理端才显示
      render(<ScriptCard script={makeScript({ status: "published" })} />);
      expect(screen.queryByText("已发布")).not.toBeInTheDocument();
    });

    it("showStatusBadge=true 且 status=published 时显示「已发布」", () => {
      render(
        <ScriptCard
          script={makeScript({ status: "published" })}
          showStatusBadge
        />
      );
      expect(screen.getByText("已发布")).toBeInTheDocument();
    });

    it("status=draft 时显示「草稿」", () => {
      render(
        <ScriptCard script={makeScript({ status: "draft" })} showStatusBadge />
      );
      expect(screen.getByText("草稿")).toBeInTheDocument();
    });

    it("status=pending_review 时显示「待审核」", () => {
      render(
        <ScriptCard
          script={makeScript({ status: "pending_review" })}
          showStatusBadge
        />
      );
      expect(screen.getByText("待审核")).toBeInTheDocument();
    });

    it("status=rejected 时显示「已拒绝」", () => {
      render(
        <ScriptCard
          script={makeScript({ status: "rejected" })}
          showStatusBadge
        />
      );
      expect(screen.getByText("已拒绝")).toBeInTheDocument();
    });

    it("status=archived 时显示「已归档」", () => {
      render(
        <ScriptCard
          script={makeScript({ status: "archived" })}
          showStatusBadge
        />
      );
      expect(screen.getByText("已归档")).toBeInTheDocument();
    });
  });

  describe("复制按钮", () => {
    it("渲染复制按钮（带可访问的标签）", () => {
      render(<ScriptCard script={makeScript()} />);
      const btn = screen.getByRole("button", { name: /复制/ });
      expect(btn).toBeInTheDocument();
    });

    it("点击复制按钮触发 onCopy 回调，回调收到 script.id", () => {
      const onCopy = vi.fn();
      const script = makeScript();
      render(<ScriptCard script={script} onCopy={onCopy} />);
      fireEvent.click(screen.getByRole("button", { name: /复制/ }));
      expect(onCopy).toHaveBeenCalledTimes(1);
      expect(onCopy).toHaveBeenCalledWith(script);
    });

    it("不传 onCopy 时点击不抛错", () => {
      render(<ScriptCard script={makeScript()} />);
      expect(() => {
        fireEvent.click(screen.getByRole("button", { name: /复制/ }));
      }).not.toThrow();
    });

    it("disabled=true 时复制按钮被禁用", () => {
      const onCopy = vi.fn();
      render(<ScriptCard script={makeScript()} onCopy={onCopy} disabled />);
      const btn = screen.getByRole("button", { name: /复制/ }) as HTMLButtonElement;
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
      expect(onCopy).not.toHaveBeenCalled();
    });
  });

  describe("可访问性", () => {
    it("根元素带 article 语义（用 role 或 article 标签）", () => {
      render(<ScriptCard script={makeScript()} />);
      // 卡片应当是一个语义化容器，便于屏读器
      expect(screen.getByRole("article")).toBeInTheDocument();
    });
  });
});
