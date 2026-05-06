import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ScriptFilters,
  type ScriptFiltersValue,
  type ScriptFiltersTagOption,
} from "@/components/scripts/script-filters";

/**
 * 单元测试：ScriptFilters（unit28 - 筛选组件）
 *
 * 覆盖：
 *  - 渲染场景标签 / 产品标签 / 关键字搜索 / 排序四个区段
 *  - 受控组件：value 变化时 UI 同步
 *  - onChange 上抛新值（不可变更新）
 *  - 多选切换：再次点击移除
 *  - 「全部」按钮清空 group
 *  - 排序下拉切换
 *  - 用 userEvent 而非 fireEvent（修 Batch 9 unit27 MEDIUM 反馈）
 */

const SCENE_OPTIONS: ScriptFiltersTagOption[] = [
  { id: "scene-1", name: "进店问询", groupKey: "scene" },
  { id: "scene-2", name: "价格异议", groupKey: "scene" },
];
const PRODUCT_OPTIONS: ScriptFiltersTagOption[] = [
  { id: "product-1", name: "隔热膜", groupKey: "product" },
  { id: "product-2", name: "车衣", groupKey: "product" },
];

const EMPTY_VALUE: ScriptFiltersValue = {
  q: "",
  sceneTagIds: [],
  productTagIds: [],
  sortBy: "updated_desc",
};

function renderFilters(
  initial: Partial<ScriptFiltersValue> = {},
  onChange = vi.fn()
) {
  const value: ScriptFiltersValue = { ...EMPTY_VALUE, ...initial };
  const utils = render(
    <ScriptFilters
      value={value}
      sceneOptions={SCENE_OPTIONS}
      productOptions={PRODUCT_OPTIONS}
      onChange={onChange}
    />
  );
  return { ...utils, onChange };
}

describe("ScriptFilters 组件", () => {
  describe("基础渲染", () => {
    it("渲染场景标签按钮", () => {
      renderFilters();
      expect(screen.getByText("进店问询")).toBeInTheDocument();
      expect(screen.getByText("价格异议")).toBeInTheDocument();
    });

    it("渲染产品标签按钮", () => {
      renderFilters();
      expect(screen.getByText("隔热膜")).toBeInTheDocument();
      expect(screen.getByText("车衣")).toBeInTheDocument();
    });

    it("渲染搜索输入框", () => {
      renderFilters();
      expect(
        screen.getByPlaceholderText(/搜索话术/)
      ).toBeInTheDocument();
    });

    it("渲染场景与产品分组标题", () => {
      renderFilters();
      expect(screen.getByText("场景")).toBeInTheDocument();
      expect(screen.getByText("产品")).toBeInTheDocument();
    });

    it("每个分组都有「全部」按钮", () => {
      renderFilters();
      const allButtons = screen.getAllByRole("button", { name: "全部" });
      expect(allButtons).toHaveLength(2);
    });
  });

  describe("受控状态展示", () => {
    it("value.q 显示在输入框中", () => {
      renderFilters({ q: "镀膜价格" });
      const input = screen.getByPlaceholderText(
        /搜索话术/
      ) as HTMLInputElement;
      expect(input.value).toBe("镀膜价格");
    });

    it("已选场景标签带 aria-pressed=true", () => {
      renderFilters({ sceneTagIds: ["scene-1"] });
      const btn = screen.getByRole("button", { name: "进店问询" });
      expect(btn).toHaveAttribute("aria-pressed", "true");
    });

    it("未选标签 aria-pressed=false", () => {
      renderFilters({ sceneTagIds: ["scene-1"] });
      const btn = screen.getByRole("button", { name: "价格异议" });
      expect(btn).toHaveAttribute("aria-pressed", "false");
    });

    it("已选多个产品标签同时高亮", () => {
      renderFilters({ productTagIds: ["product-1", "product-2"] });
      expect(
        screen.getByRole("button", { name: "隔热膜" })
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getByRole("button", { name: "车衣" })
      ).toHaveAttribute("aria-pressed", "true");
    });

    it("场景为空时「全部」按钮 aria-pressed=true", () => {
      renderFilters({ sceneTagIds: [] });
      const allButtons = screen.getAllByRole("button", { name: "全部" });
      // 第一个「全部」对应场景，第二个对应产品
      expect(allButtons[0]).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("交互：场景标签", () => {
    it("点击场景标签触发 onChange，加入 sceneTagIds", async () => {
      const user = userEvent.setup();
      const { onChange } = renderFilters();
      await user.click(screen.getByRole("button", { name: "进店问询" }));
      expect(onChange).toHaveBeenCalledTimes(1);
      const next = onChange.mock.calls[0][0] as ScriptFiltersValue;
      expect(next.sceneTagIds).toEqual(["scene-1"]);
      expect(next.productTagIds).toEqual([]);
      expect(next.q).toBe("");
      expect(next.sortBy).toBe("updated_desc");
    });

    it("再次点击已选场景标签将其移除", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilters({ sceneTagIds: ["scene-1"] }, onChange);
      await user.click(screen.getByRole("button", { name: "进店问询" }));
      const next = onChange.mock.calls[0][0] as ScriptFiltersValue;
      expect(next.sceneTagIds).toEqual([]);
    });

    it("点击多个场景标签累加（多选）", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilters({ sceneTagIds: ["scene-1"] }, onChange);
      await user.click(screen.getByRole("button", { name: "价格异议" }));
      const next = onChange.mock.calls[0][0] as ScriptFiltersValue;
      expect(next.sceneTagIds).toEqual(["scene-1", "scene-2"]);
    });

    it("不可变更新：原 value.sceneTagIds 数组未被修改", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const original: ScriptFiltersValue = {
        ...EMPTY_VALUE,
        sceneTagIds: ["scene-1"],
      };
      const originalSceneTagIds = original.sceneTagIds;
      render(
        <ScriptFilters
          value={original}
          sceneOptions={SCENE_OPTIONS}
          productOptions={PRODUCT_OPTIONS}
          onChange={onChange}
        />
      );
      await user.click(screen.getByRole("button", { name: "价格异议" }));
      // 原数组没变（不可变）
      expect(originalSceneTagIds).toEqual(["scene-1"]);
      const next = onChange.mock.calls[0][0] as ScriptFiltersValue;
      expect(next.sceneTagIds).not.toBe(originalSceneTagIds);
    });
  });

  describe("交互：产品标签", () => {
    it("点击产品标签触发 onChange", async () => {
      const user = userEvent.setup();
      const { onChange } = renderFilters();
      await user.click(screen.getByRole("button", { name: "隔热膜" }));
      const next = onChange.mock.calls[0][0] as ScriptFiltersValue;
      expect(next.productTagIds).toEqual(["product-1"]);
    });

    it("再次点击已选产品标签将其移除", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilters({ productTagIds: ["product-1", "product-2"] }, onChange);
      await user.click(screen.getByRole("button", { name: "隔热膜" }));
      const next = onChange.mock.calls[0][0] as ScriptFiltersValue;
      expect(next.productTagIds).toEqual(["product-2"]);
    });
  });

  describe("交互：「全部」按钮", () => {
    it("点击场景「全部」清空 sceneTagIds", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilters({ sceneTagIds: ["scene-1", "scene-2"] }, onChange);
      const allButtons = screen.getAllByRole("button", { name: "全部" });
      await user.click(allButtons[0]); // 场景全部
      const next = onChange.mock.calls[0][0] as ScriptFiltersValue;
      expect(next.sceneTagIds).toEqual([]);
    });

    it("点击产品「全部」清空 productTagIds", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilters(
        { productTagIds: ["product-1", "product-2"] },
        onChange
      );
      const allButtons = screen.getAllByRole("button", { name: "全部" });
      await user.click(allButtons[1]); // 产品全部
      const next = onChange.mock.calls[0][0] as ScriptFiltersValue;
      expect(next.productTagIds).toEqual([]);
    });

    it("点击场景「全部」不影响 productTagIds", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilters(
        {
          sceneTagIds: ["scene-1"],
          productTagIds: ["product-1"],
        },
        onChange
      );
      const allButtons = screen.getAllByRole("button", { name: "全部" });
      await user.click(allButtons[0]);
      const next = onChange.mock.calls[0][0] as ScriptFiltersValue;
      expect(next.sceneTagIds).toEqual([]);
      expect(next.productTagIds).toEqual(["product-1"]);
    });
  });

  describe("交互：搜索输入", () => {
    it("输入文字触发 onChange，q 字段同步", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilters({}, onChange);
      const input = screen.getByPlaceholderText(/搜索话术/);
      await user.type(input, "镀");
      // userEvent.type 每个字符触发一次 onChange
      expect(onChange).toHaveBeenCalled();
      const last = onChange.mock.calls.at(-1)?.[0] as ScriptFiltersValue;
      expect(last.q).toBe("镀");
    });

    it("清空搜索框时 q 变为空字符串", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilters({ q: "abc" }, onChange);
      const input = screen.getByPlaceholderText(/搜索话术/);
      await user.clear(input);
      const last = onChange.mock.calls.at(-1)?.[0] as ScriptFiltersValue;
      expect(last.q).toBe("");
    });
  });

  describe("交互：排序", () => {
    it("默认 sortBy=updated_desc", () => {
      renderFilters();
      const select = screen.getByLabelText(/排序/) as HTMLSelectElement;
      expect(select.value).toBe("updated_desc");
    });

    it("切换排序触发 onChange", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilters({}, onChange);
      const select = screen.getByLabelText(/排序/);
      await user.selectOptions(select, "usage_desc");
      const next = onChange.mock.calls[0][0] as ScriptFiltersValue;
      expect(next.sortBy).toBe("usage_desc");
    });

    it("可切换为 created_desc", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilters({}, onChange);
      const select = screen.getByLabelText(/排序/);
      await user.selectOptions(select, "created_desc");
      const next = onChange.mock.calls[0][0] as ScriptFiltersValue;
      expect(next.sortBy).toBe("created_desc");
    });
  });

  describe("空选项防御", () => {
    it("无场景选项时仍能渲染（不抛错）", () => {
      const onChange = vi.fn();
      render(
        <ScriptFilters
          value={EMPTY_VALUE}
          sceneOptions={[]}
          productOptions={PRODUCT_OPTIONS}
          onChange={onChange}
        />
      );
      // 场景区只有「全部」按钮
      expect(screen.queryByText("进店问询")).not.toBeInTheDocument();
      expect(screen.getByText("场景")).toBeInTheDocument();
    });

    it("产品选项为空时仅渲染场景标签", () => {
      const onChange = vi.fn();
      render(
        <ScriptFilters
          value={EMPTY_VALUE}
          sceneOptions={SCENE_OPTIONS}
          productOptions={[]}
          onChange={onChange}
        />
      );
      expect(screen.queryByText("隔热膜")).not.toBeInTheDocument();
      expect(screen.getByText("产品")).toBeInTheDocument();
    });
  });
});
