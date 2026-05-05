import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ScriptForm,
  type ScriptFormValues,
  type ScriptFormTagOption,
} from "@/components/admin/scripts/script-form";

/**
 * 单元测试：ScriptForm 管理端表单组件（unit31）
 *
 * 覆盖：
 *  - 受控状态（title / customerQuestion / answer）
 *  - 场景 / 产品标签多选 toggle + 不可变更新
 *  - status 切换 draft / published（默认 draft）
 *  - mode='create' / mode='edit' 文案 + initialValues 注入
 *  - 提交：调用 onSubmit(values)，校验失败不调用
 *  - 校验：title / customerQuestion / answer 必填
 *  - a11y：所有控件有 label
 *  - 提交中禁用按钮（isSubmitting 透传）
 *  - 取消按钮调 onCancel
 */

const SCENE_TAG_A: ScriptFormTagOption = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "进店问询",
  groupKey: "scene",
};
const SCENE_TAG_B: ScriptFormTagOption = {
  id: "11111111-1111-4111-8111-222222222222",
  name: "电话回访",
  groupKey: "scene",
};
const PRODUCT_TAG_A: ScriptFormTagOption = {
  id: "22222222-2222-4222-8222-111111111111",
  name: "镀膜",
  groupKey: "product",
};
const PRODUCT_TAG_B: ScriptFormTagOption = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "贴膜",
  groupKey: "product",
};

function defaultProps() {
  return {
    sceneOptions: [SCENE_TAG_A, SCENE_TAG_B],
    productOptions: [PRODUCT_TAG_A, PRODUCT_TAG_B],
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  };
}

describe("ScriptForm 表单组件", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("a11y / 渲染", () => {
    it("a11y：title / 客户问题 / 答案三个输入有可访问 label", () => {
      render(<ScriptForm mode="create" {...defaultProps()} />);
      expect(screen.getByLabelText(/标题/)).toBeInTheDocument();
      expect(screen.getByLabelText(/员工提问|客户问题/)).toBeInTheDocument();
      expect(screen.getByLabelText(/话术内容|答案/)).toBeInTheDocument();
    });

    it("create 模式按钮文案为「创建」", () => {
      render(<ScriptForm mode="create" {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: /创建|提交/ })
      ).toBeInTheDocument();
    });

    it("edit 模式按钮文案为「保存」", () => {
      render(
        <ScriptForm
          mode="edit"
          initialValues={{
            title: "old",
            customerQuestion: "old q",
            answer: "old a",
            sceneTagIds: [],
            productTagIds: [],
            status: "draft",
          }}
          {...defaultProps()}
        />
      );
      expect(
        screen.getByRole("button", { name: /保存|更新/ })
      ).toBeInTheDocument();
    });

    it("status 默认 draft（create 模式）", () => {
      render(<ScriptForm mode="create" {...defaultProps()} />);
      const draft = screen.getByLabelText(/草稿/) as HTMLInputElement;
      expect(draft.checked).toBe(true);
    });

    it("渲染场景与产品标签按钮", () => {
      render(<ScriptForm mode="create" {...defaultProps()} />);
      expect(screen.getByRole("button", { name: "进店问询" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "镀膜" })).toBeInTheDocument();
    });

    it("没有标签选项时显示空态文案", () => {
      render(
        <ScriptForm
          mode="create"
          {...defaultProps()}
          sceneOptions={[]}
          productOptions={[]}
        />
      );
      // 至少渲染场景 / 产品两个分组标题
      expect(screen.getAllByText(/暂无/).length).toBeGreaterThan(0);
    });
  });

  describe("initialValues 注入（edit）", () => {
    it("注入 title / customerQuestion / answer", () => {
      render(
        <ScriptForm
          mode="edit"
          initialValues={{
            title: "镀膜 FAQ",
            customerQuestion: "能保几年？",
            answer: "12-18 个月",
            sceneTagIds: [SCENE_TAG_A.id],
            productTagIds: [PRODUCT_TAG_A.id],
            status: "published",
          }}
          {...defaultProps()}
        />
      );
      expect(screen.getByDisplayValue("镀膜 FAQ")).toBeInTheDocument();
      expect(screen.getByDisplayValue("能保几年？")).toBeInTheDocument();
      expect(screen.getByDisplayValue("12-18 个月")).toBeInTheDocument();
    });

    it("注入选中的场景与产品标签（aria-pressed=true）", () => {
      render(
        <ScriptForm
          mode="edit"
          initialValues={{
            title: "t",
            customerQuestion: "q",
            answer: "a",
            sceneTagIds: [SCENE_TAG_A.id],
            productTagIds: [PRODUCT_TAG_A.id],
            status: "draft",
          }}
          {...defaultProps()}
        />
      );
      expect(screen.getByRole("button", { name: "进店问询" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.getByRole("button", { name: "电话回访" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
      expect(screen.getByRole("button", { name: "镀膜" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });

    it("注入 status=published（edit）", () => {
      render(
        <ScriptForm
          mode="edit"
          initialValues={{
            title: "t",
            customerQuestion: "q",
            answer: "a",
            sceneTagIds: [],
            productTagIds: [],
            status: "published",
          }}
          {...defaultProps()}
        />
      );
      const published = screen.getByLabelText(/已发布/) as HTMLInputElement;
      expect(published.checked).toBe(true);
    });
  });

  describe("受控输入", () => {
    it("user.type 修改 title", async () => {
      const user = userEvent.setup();
      render(<ScriptForm mode="create" {...defaultProps()} />);
      const input = screen.getByLabelText(/标题/);
      await user.type(input, "新话术");
      expect((input as HTMLInputElement).value).toBe("新话术");
    });

    it("修改答案（textarea）", async () => {
      const user = userEvent.setup();
      render(<ScriptForm mode="create" {...defaultProps()} />);
      const ta = screen.getByLabelText(/话术内容|答案/);
      await user.type(ta, "答案内容");
      expect((ta as HTMLTextAreaElement).value).toBe("答案内容");
    });
  });

  describe("标签多选", () => {
    it("点击场景标签 toggle 选中状态", async () => {
      const user = userEvent.setup();
      render(<ScriptForm mode="create" {...defaultProps()} />);
      const btn = screen.getByRole("button", { name: "进店问询" });
      expect(btn).toHaveAttribute("aria-pressed", "false");
      await user.click(btn);
      expect(btn).toHaveAttribute("aria-pressed", "true");
      await user.click(btn);
      expect(btn).toHaveAttribute("aria-pressed", "false");
    });

    it("场景标签选中后再点产品标签互不影响", async () => {
      const user = userEvent.setup();
      render(<ScriptForm mode="create" {...defaultProps()} />);
      await user.click(screen.getByRole("button", { name: "进店问询" }));
      await user.click(screen.getByRole("button", { name: "镀膜" }));
      expect(screen.getByRole("button", { name: "进店问询" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.getByRole("button", { name: "镀膜" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.getByRole("button", { name: "电话回访" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });

    it("initialValues.sceneTagIds 不被原地修改（不可变更新）", async () => {
      const user = userEvent.setup();
      const sceneTagIds = [SCENE_TAG_A.id];
      const original = sceneTagIds.slice();
      render(
        <ScriptForm
          mode="edit"
          initialValues={{
            title: "t",
            customerQuestion: "q",
            answer: "a",
            sceneTagIds,
            productTagIds: [],
            status: "draft",
          }}
          {...defaultProps()}
        />
      );
      // 取消选中：组件内部 toggle 不能改外部数组
      await user.click(screen.getByRole("button", { name: "进店问询" }));
      expect(sceneTagIds).toEqual(original);
    });
  });

  describe("status 切换", () => {
    it("点击「已发布」单选切换 status", async () => {
      const user = userEvent.setup();
      render(<ScriptForm mode="create" {...defaultProps()} />);
      const published = screen.getByLabelText(/已发布/) as HTMLInputElement;
      await user.click(published);
      expect(published.checked).toBe(true);
    });
  });

  describe("提交", () => {
    it("提交时调 onSubmit 收到完整 values", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <ScriptForm
          mode="create"
          {...defaultProps()}
          onSubmit={onSubmit}
        />
      );
      await user.type(screen.getByLabelText(/标题/), "T");
      await user.type(screen.getByLabelText(/员工提问|客户问题/), "Q");
      await user.type(screen.getByLabelText(/话术内容|答案/), "A");
      await user.click(screen.getByRole("button", { name: "进店问询" }));
      await user.click(screen.getByRole("button", { name: "镀膜" }));
      await user.click(screen.getByLabelText(/已发布/));
      await user.click(screen.getByRole("button", { name: /创建|提交/ }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const arg = onSubmit.mock.calls[0]?.[0] as ScriptFormValues;
      expect(arg).toMatchObject({
        title: "T",
        customerQuestion: "Q",
        answer: "A",
        sceneTagIds: [SCENE_TAG_A.id],
        productTagIds: [PRODUCT_TAG_A.id],
        status: "published",
      });
    });

    it("title 为空时不调 onSubmit 且显示错误", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <ScriptForm
          mode="create"
          {...defaultProps()}
          onSubmit={onSubmit}
        />
      );
      // 仅填客户问题/答案，跳过标题
      await user.type(screen.getByLabelText(/员工提问|客户问题/), "Q");
      await user.type(screen.getByLabelText(/话术内容|答案/), "A");
      await user.click(screen.getByRole("button", { name: /创建|提交/ }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText(/标题不能为空|请输入标题/)).toBeInTheDocument();
    });

    it("customerQuestion 为空 → 校验失败", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <ScriptForm
          mode="create"
          {...defaultProps()}
          onSubmit={onSubmit}
        />
      );
      await user.type(screen.getByLabelText(/标题/), "T");
      await user.type(screen.getByLabelText(/话术内容|答案/), "A");
      await user.click(screen.getByRole("button", { name: /创建|提交/ }));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("answer 为空 → 校验失败", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <ScriptForm
          mode="create"
          {...defaultProps()}
          onSubmit={onSubmit}
        />
      );
      await user.type(screen.getByLabelText(/标题/), "T");
      await user.type(screen.getByLabelText(/员工提问|客户问题/), "Q");
      await user.click(screen.getByRole("button", { name: /创建|提交/ }));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("title 含非法 UUID 标签时校验失败", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      // 注入一个非 UUID 的 sceneTagId，触发 zod 校验失败
      render(
        <ScriptForm
          mode="create"
          {...defaultProps()}
          initialValues={{
            title: "T",
            customerQuestion: "Q",
            answer: "A",
            sceneTagIds: ["not-a-uuid"],
            productTagIds: [],
            status: "draft",
          }}
          onSubmit={onSubmit}
        />
      );
      await user.click(screen.getByRole("button", { name: /创建|提交/ }));

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("isSubmitting", () => {
    it("isSubmitting 时禁用提交按钮", () => {
      render(
        <ScriptForm
          mode="create"
          {...defaultProps()}
          isSubmitting
        />
      );
      const submit = screen.getByRole("button", { name: /创建|提交|保存中/ });
      expect(submit).toBeDisabled();
    });
  });

  describe("取消", () => {
    it("点击取消调 onCancel", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      render(
        <ScriptForm
          mode="create"
          {...defaultProps()}
          onCancel={onCancel}
        />
      );
      await user.click(screen.getByRole("button", { name: /取消/ }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("不传 onCancel 时不渲染取消按钮", () => {
      render(
        <ScriptForm
          mode="create"
          sceneOptions={[]}
          productOptions={[]}
          onSubmit={vi.fn()}
        />
      );
      expect(
        screen.queryByRole("button", { name: /取消/ })
      ).not.toBeInTheDocument();
    });
  });
});
