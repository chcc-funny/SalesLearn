import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ReviewPanel,
  type ReviewPanelScript,
} from "@/components/admin/scripts/review-panel";

/**
 * 单元测试：ReviewPanel 审核面板组件（unit48）
 *
 * 覆盖：
 *  - 渲染：列表（仅 pending_review）+ 选中后展示详情视图
 *  - 选中：点击列表行 → 详情区出现该话术
 *  - 编辑：详情区可编辑 title/customerQuestion/answer（沿用 ScriptForm 风格）
 *  - 通过：点「通过」按钮 → 调用 onApprove(id, edits)
 *  - 驳回：点「驳回」 → 弹 reject reason 输入 → 调用 onReject(id, reason)
 *  - 必填校验：reject 必须填 reason，否则不调用回调
 *  - 加载/提交态：isLoading 时禁用按钮；isSubmitting 时按钮文案变化
 *  - 空态：列表为空时显示提示
 *  - a11y：role/aria-label 完整
 *  - 不可变：edits 不修改 props.scripts
 */

const SCRIPT_A: ReviewPanelScript = {
  id: "11111111-1111-4111-8111-aaaaaaaaaaaa",
  title: "镀膜保养介绍",
  customerQuestion: "镀膜能保多久？",
  answer: "标准答案 A：镀膜可保 1-3 年，视使用环境而定。",
  status: "pending_review",
  source: "ai_submitted",
  createdAt: "2026-04-01T00:00:00.000Z",
  sceneTagIds: ["scene-1"],
  productTagIds: ["product-1"],
  tags: [
    { id: "scene-1", name: "进店问询", groupKey: "scene" },
    { id: "product-1", name: "镀膜", groupKey: "product" },
  ],
};

const SCRIPT_B: ReviewPanelScript = {
  id: "22222222-2222-4222-8222-bbbbbbbbbbbb",
  title: "蒸汽洗注意事项",
  customerQuestion: "蒸汽洗会损坏车漆吗？",
  answer: "标准答案 B：蒸汽洗温度可控不损伤车漆。",
  status: "pending_review",
  source: "ai_submitted",
  createdAt: "2026-04-02T00:00:00.000Z",
  sceneTagIds: [],
  productTagIds: [],
  tags: [],
};

function defaultProps() {
  return {
    scripts: [SCRIPT_A, SCRIPT_B],
    onApprove: vi.fn(),
    onReject: vi.fn(),
    isLoading: false,
    isSubmitting: false,
  };
}

describe("ReviewPanel 审核面板", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("a11y / 渲染", () => {
    it("渲染列表（标题/客户问题摘要）", () => {
      render(<ReviewPanel {...defaultProps()} />);
      expect(screen.getByText("镀膜保养介绍")).toBeInTheDocument();
      expect(screen.getByText("蒸汽洗注意事项")).toBeInTheDocument();
    });

    it("列表行有 role=button + aria-label 含标题", () => {
      render(<ReviewPanel {...defaultProps()} />);
      const row = screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ });
      expect(row).toBeInTheDocument();
    });

    it("列表为空时显示空态文案", () => {
      render(<ReviewPanel {...defaultProps()} scripts={[]} />);
      expect(screen.getByText(/暂无待审核话术/)).toBeInTheDocument();
    });

    it("详情区在未选中时显示提示文案", () => {
      render(<ReviewPanel {...defaultProps()} />);
      expect(screen.getByText(/请从左侧选择一条待审核话术/)).toBeInTheDocument();
    });

    it("根容器有 region role + aria-label", () => {
      render(<ReviewPanel {...defaultProps()} />);
      expect(
        screen.getByRole("region", { name: /待审核话术/ })
      ).toBeInTheDocument();
    });
  });

  describe("选中 / 详情展示", () => {
    it("点击行后详情区展示该话术内容", async () => {
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps()} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      const detail = screen.getByRole("form", { name: /审核编辑/ });
      expect(within(detail).getByDisplayValue("镀膜保养介绍")).toBeInTheDocument();
      expect(
        within(detail).getByDisplayValue("镀膜能保多久？")
      ).toBeInTheDocument();
      expect(
        within(detail).getByDisplayValue(/标准答案 A/)
      ).toBeInTheDocument();
    });

    it("切换到第二条时详情区随之更新", async () => {
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps()} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      await user.click(
        screen.getByRole("button", { name: /选择话术「蒸汽洗注意事项」/ })
      );
      const detail = screen.getByRole("form", { name: /审核编辑/ });
      expect(
        within(detail).getByDisplayValue("蒸汽洗注意事项")
      ).toBeInTheDocument();
    });

    it("选中行有 aria-pressed=true，未选中行 aria-pressed=false", async () => {
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps()} />);
      const rowA = screen.getByRole("button", {
        name: /选择话术「镀膜保养介绍」/,
      });
      const rowB = screen.getByRole("button", {
        name: /选择话术「蒸汽洗注意事项」/,
      });
      expect(rowA).toHaveAttribute("aria-pressed", "false");
      await user.click(rowA);
      expect(rowA).toHaveAttribute("aria-pressed", "true");
      expect(rowB).toHaveAttribute("aria-pressed", "false");
    });
  });

  describe("编辑 + 通过", () => {
    it("默认编辑后通过：onApprove 收到 (id, edits)", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<ReviewPanel {...props} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      const titleInput = screen.getByLabelText(/标题/);
      await user.clear(titleInput);
      await user.type(titleInput, "审核后新标题");
      await user.click(screen.getByRole("button", { name: /^通过$/ }));
      expect(props.onApprove).toHaveBeenCalledTimes(1);
      const [id, edits] = props.onApprove.mock.calls[0];
      expect(id).toBe(SCRIPT_A.id);
      expect(edits.title).toBe("审核后新标题");
      expect(edits.customerQuestion).toBe("镀膜能保多久？");
      expect(edits.answer).toBe(SCRIPT_A.answer);
    });

    it("无编辑直接通过：edits 与原值一致", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<ReviewPanel {...props} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      await user.click(screen.getByRole("button", { name: /^通过$/ }));
      expect(props.onApprove).toHaveBeenCalledTimes(1);
      const [, edits] = props.onApprove.mock.calls[0];
      expect(edits.title).toBe(SCRIPT_A.title);
      expect(edits.answer).toBe(SCRIPT_A.answer);
    });

    it("title 为空时通过失败：onApprove 不调用，显示错误", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<ReviewPanel {...props} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      const titleInput = screen.getByLabelText(/标题/);
      await user.clear(titleInput);
      await user.click(screen.getByRole("button", { name: /^通过$/ }));
      expect(props.onApprove).not.toHaveBeenCalled();
      expect(screen.getByText(/标题不能为空/)).toBeInTheDocument();
    });

    it("answer 为空时通过失败：onApprove 不调用", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<ReviewPanel {...props} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      const answerInput = screen.getByLabelText(/答案/);
      await user.clear(answerInput);
      await user.click(screen.getByRole("button", { name: /^通过$/ }));
      expect(props.onApprove).not.toHaveBeenCalled();
    });
  });

  describe("驳回", () => {
    it("点击驳回按钮 → 显示 reason 输入框", async () => {
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps()} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      await user.click(screen.getByRole("button", { name: /^驳回$/ }));
      expect(screen.getByLabelText(/拒绝原因/)).toBeInTheDocument();
    });

    it("填写 reason 后确认 → onReject(id, reason) 被调用", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<ReviewPanel {...props} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      await user.click(screen.getByRole("button", { name: /^驳回$/ }));
      await user.type(
        screen.getByLabelText(/拒绝原因/),
        "答案与产品规格不符"
      );
      await user.click(screen.getByRole("button", { name: /确认驳回/ }));
      expect(props.onReject).toHaveBeenCalledTimes(1);
      expect(props.onReject).toHaveBeenCalledWith(
        SCRIPT_A.id,
        "答案与产品规格不符"
      );
    });

    it("reason 为空时确认驳回 → onReject 不调用，显示错误", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<ReviewPanel {...props} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      await user.click(screen.getByRole("button", { name: /^驳回$/ }));
      await user.click(screen.getByRole("button", { name: /确认驳回/ }));
      expect(props.onReject).not.toHaveBeenCalled();
      expect(screen.getByText(/拒绝原因不能为空/)).toBeInTheDocument();
    });

    it("点击驳回的「取消」按钮 → 隐藏 reason 输入框", async () => {
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps()} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      await user.click(screen.getByRole("button", { name: /^驳回$/ }));
      expect(screen.getByLabelText(/拒绝原因/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^取消$/ }));
      expect(screen.queryByLabelText(/拒绝原因/)).not.toBeInTheDocument();
    });
  });

  describe("加载 / 提交态", () => {
    it("isLoading=true 时显示加载文案", () => {
      render(<ReviewPanel {...defaultProps()} isLoading />);
      expect(screen.getByText(/加载中/)).toBeInTheDocument();
    });

    it("isSubmitting=true 时通过/驳回按钮被禁用", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<ReviewPanel {...defaultProps()} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      rerender(<ReviewPanel {...defaultProps()} isSubmitting />);
      expect(screen.getByRole("button", { name: /^通过中/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^驳回$/ })).toBeDisabled();
    });
  });

  describe("不可变 / 安全性", () => {
    it("编辑详情后原 props.scripts 数组与对象未被修改", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      const snapshot = JSON.parse(JSON.stringify(props.scripts));
      render(<ReviewPanel {...props} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      const titleInput = screen.getByLabelText(/标题/);
      await user.clear(titleInput);
      await user.type(titleInput, "修改后");
      // 原数组 / 对象内容应保持不变
      expect(props.scripts).toEqual(snapshot);
    });

    it("scripts 列表更新且选中项不在新列表中 → 详情区清空", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      const { rerender } = render(<ReviewPanel {...props} />);
      await user.click(
        screen.getByRole("button", { name: /选择话术「镀膜保养介绍」/ })
      );
      // SCRIPT_A 被移除（如审核通过后从列表移除）
      rerender(<ReviewPanel {...props} scripts={[SCRIPT_B]} />);
      await waitFor(() => {
        expect(
          screen.getByText(/请从左侧选择一条待审核话术/)
        ).toBeInTheDocument();
      });
    });
  });
});
