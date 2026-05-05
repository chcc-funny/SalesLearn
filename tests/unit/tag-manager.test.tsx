import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagManager, type TagManagerTag } from "@/components/admin/scripts/tag-manager";

/**
 * 单元测试：TagManager 标签管理组件（unit34）
 *
 * 覆盖：
 *  - 渲染：场景 / 产品两栏，按 sortOrder 升序
 *  - 新建：点击「新增」打开输入框，提交后调用 onCreate(groupKey, name)
 *  - 编辑：点击编辑按钮 → 输入框出现 → 保存调用 onUpdate(id, { name })
 *  - 软删：点击删除按钮调用 onDelete(id)
 *  - 排序：上下移动按钮调用 onMove(groupKey, id, direction)
 *  - a11y：fieldset/legend 分组、按钮 aria-label、aria-pressed for toggle
 *  - 空态：分组无标签时显示提示
 *  - 校验：新建/编辑空名称不调用 onCreate/onUpdate
 *  - isLoading：提交期间禁用输入
 */

const SCENE_TAG_A: TagManagerTag = {
  id: "11111111-1111-4111-8111-aaaaaaaaaaaa",
  name: "进店问询",
  groupKey: "scene",
  sortOrder: 0,
  isActive: true,
};
const SCENE_TAG_B: TagManagerTag = {
  id: "11111111-1111-4111-8111-bbbbbbbbbbbb",
  name: "电话回访",
  groupKey: "scene",
  sortOrder: 1,
  isActive: true,
};
const PRODUCT_TAG_A: TagManagerTag = {
  id: "22222222-2222-4222-8222-aaaaaaaaaaaa",
  name: "镀膜",
  groupKey: "product",
  sortOrder: 0,
  isActive: true,
};

function defaultProps() {
  return {
    tags: [SCENE_TAG_A, SCENE_TAG_B, PRODUCT_TAG_A],
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
  };
}

describe("TagManager 标签管理组件", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("a11y / 渲染", () => {
    it("渲染场景与产品两个分组（fieldset + legend）", () => {
      render(<TagManager {...defaultProps()} />);
      expect(screen.getByRole("group", { name: /场景标签/ })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: /产品标签/ })).toBeInTheDocument();
    });

    it("场景分组下渲染所有 scene 标签", () => {
      render(<TagManager {...defaultProps()} />);
      const sceneGroup = screen.getByRole("group", { name: /场景标签/ });
      expect(within(sceneGroup).getByText("进店问询")).toBeInTheDocument();
      expect(within(sceneGroup).getByText("电话回访")).toBeInTheDocument();
    });

    it("产品分组下渲染所有 product 标签", () => {
      render(<TagManager {...defaultProps()} />);
      const productGroup = screen.getByRole("group", { name: /产品标签/ });
      expect(within(productGroup).getByText("镀膜")).toBeInTheDocument();
    });

    it("场景中按 sortOrder 升序展示（A 在 B 之前）", () => {
      render(<TagManager {...defaultProps()} />);
      const sceneGroup = screen.getByRole("group", { name: /场景标签/ });
      const labels = within(sceneGroup).getAllByTestId("tag-name");
      expect(labels[0]).toHaveTextContent("进店问询");
      expect(labels[1]).toHaveTextContent("电话回访");
    });

    it("乱序输入时仍按 sortOrder 升序展示", () => {
      const props = defaultProps();
      props.tags = [
        { ...SCENE_TAG_B, sortOrder: 0 },
        { ...SCENE_TAG_A, sortOrder: 1 },
        PRODUCT_TAG_A,
      ];
      render(<TagManager {...props} />);
      const sceneGroup = screen.getByRole("group", { name: /场景标签/ });
      const labels = within(sceneGroup).getAllByTestId("tag-name");
      expect(labels[0]).toHaveTextContent("电话回访");
      expect(labels[1]).toHaveTextContent("进店问询");
    });

    it("场景为空时显示空态", () => {
      const props = defaultProps();
      props.tags = [PRODUCT_TAG_A];
      render(<TagManager {...props} />);
      const sceneGroup = screen.getByRole("group", { name: /场景标签/ });
      expect(within(sceneGroup).getByText(/暂无场景标签/)).toBeInTheDocument();
    });

    it("产品为空时显示空态", () => {
      const props = defaultProps();
      props.tags = [SCENE_TAG_A];
      render(<TagManager {...props} />);
      const productGroup = screen.getByRole("group", { name: /产品标签/ });
      expect(within(productGroup).getByText(/暂无产品标签/)).toBeInTheDocument();
    });

    it("每个标签都有删除按钮（aria-label 包含标签名）", () => {
      render(<TagManager {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: /删除标签「进店问询」/ })
      ).toBeInTheDocument();
    });

    it("每个标签都有编辑按钮（aria-label 包含标签名）", () => {
      render(<TagManager {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: /编辑标签「进店问询」/ })
      ).toBeInTheDocument();
    });

    it("每个标签都有上移和下移按钮", () => {
      render(<TagManager {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: /上移「进店问询」/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /下移「进店问询」/ })
      ).toBeInTheDocument();
    });

    it("两栏各有「新增」按钮", () => {
      render(<TagManager {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: /新增场景标签/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /新增产品标签/ })
      ).toBeInTheDocument();
    });
  });

  describe("新建标签", () => {
    it("点击「新增场景标签」打开输入框", async () => {
      const user = userEvent.setup();
      render(<TagManager {...defaultProps()} />);
      await user.click(screen.getByRole("button", { name: /新增场景标签/ }));
      expect(
        screen.getByLabelText(/新场景标签名称/)
      ).toBeInTheDocument();
    });

    it("填入名称并提交，调用 onCreate(scene, name)", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TagManager {...props} />);
      await user.click(screen.getByRole("button", { name: /新增场景标签/ }));
      const input = screen.getByLabelText(/新场景标签名称/);
      await user.type(input, "售后维保");
      await user.click(screen.getByRole("button", { name: /^保存新标签$/ }));
      expect(props.onCreate).toHaveBeenCalledTimes(1);
      expect(props.onCreate).toHaveBeenCalledWith("scene", "售后维保");
    });

    it("空名称不调用 onCreate", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TagManager {...props} />);
      await user.click(screen.getByRole("button", { name: /新增场景标签/ }));
      await user.click(screen.getByRole("button", { name: /^保存新标签$/ }));
      expect(props.onCreate).not.toHaveBeenCalled();
    });

    it("产品分组新增调用 onCreate(product, name)", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TagManager {...props} />);
      await user.click(screen.getByRole("button", { name: /新增产品标签/ }));
      const input = screen.getByLabelText(/新产品标签名称/);
      await user.type(input, "改色膜");
      await user.click(screen.getByRole("button", { name: /^保存新标签$/ }));
      expect(props.onCreate).toHaveBeenCalledWith("product", "改色膜");
    });

    it("点击取消关闭新增输入框", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TagManager {...props} />);
      await user.click(screen.getByRole("button", { name: /新增场景标签/ }));
      expect(screen.getByLabelText(/新场景标签名称/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^取消新增$/ }));
      expect(screen.queryByLabelText(/新场景标签名称/)).not.toBeInTheDocument();
    });
  });

  describe("编辑标签", () => {
    it("点击「编辑」按钮显示输入框（值为当前名称）", async () => {
      const user = userEvent.setup();
      render(<TagManager {...defaultProps()} />);
      await user.click(
        screen.getByRole("button", { name: /编辑标签「进店问询」/ })
      );
      const input = screen.getByLabelText(
        /编辑标签名称/
      ) as HTMLInputElement;
      expect(input.value).toBe("进店问询");
    });

    it("修改名称并保存，调用 onUpdate(id, { name })", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TagManager {...props} />);
      await user.click(
        screen.getByRole("button", { name: /编辑标签「进店问询」/ })
      );
      const input = screen.getByLabelText(/编辑标签名称/);
      await user.clear(input);
      await user.type(input, "新名称");
      await user.click(screen.getByRole("button", { name: /^保存编辑$/ }));
      expect(props.onUpdate).toHaveBeenCalledTimes(1);
      expect(props.onUpdate).toHaveBeenCalledWith(SCENE_TAG_A.id, {
        name: "新名称",
      });
    });

    it("编辑后输入空名称不调用 onUpdate", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TagManager {...props} />);
      await user.click(
        screen.getByRole("button", { name: /编辑标签「进店问询」/ })
      );
      const input = screen.getByLabelText(/编辑标签名称/);
      await user.clear(input);
      await user.click(screen.getByRole("button", { name: /^保存编辑$/ }));
      expect(props.onUpdate).not.toHaveBeenCalled();
    });

    it("名称未变化不调用 onUpdate", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TagManager {...props} />);
      await user.click(
        screen.getByRole("button", { name: /编辑标签「进店问询」/ })
      );
      await user.click(screen.getByRole("button", { name: /^保存编辑$/ }));
      expect(props.onUpdate).not.toHaveBeenCalled();
    });

    it("点击取消关闭编辑框，不调用 onUpdate", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TagManager {...props} />);
      await user.click(
        screen.getByRole("button", { name: /编辑标签「进店问询」/ })
      );
      await user.click(screen.getByRole("button", { name: /^取消编辑$/ }));
      expect(screen.queryByLabelText(/编辑标签名称/)).not.toBeInTheDocument();
      expect(props.onUpdate).not.toHaveBeenCalled();
    });
  });

  describe("删除（软删）", () => {
    it("点击删除按钮调用 onDelete(id)", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TagManager {...props} />);
      await user.click(
        screen.getByRole("button", { name: /删除标签「进店问询」/ })
      );
      expect(props.onDelete).toHaveBeenCalledTimes(1);
      expect(props.onDelete).toHaveBeenCalledWith(SCENE_TAG_A.id);
    });
  });

  describe("排序", () => {
    it("点击上移调用 onMove(scene, id, 'up')", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TagManager {...props} />);
      await user.click(
        screen.getByRole("button", { name: /上移「电话回访」/ })
      );
      expect(props.onMove).toHaveBeenCalledWith(
        "scene",
        SCENE_TAG_B.id,
        "up"
      );
    });

    it("点击下移调用 onMove(scene, id, 'down')", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<TagManager {...props} />);
      await user.click(
        screen.getByRole("button", { name: /下移「进店问询」/ })
      );
      expect(props.onMove).toHaveBeenCalledWith(
        "scene",
        SCENE_TAG_A.id,
        "down"
      );
    });

    it("第一个标签的「上移」按钮 disabled", () => {
      render(<TagManager {...defaultProps()} />);
      const upBtn = screen.getByRole("button", { name: /上移「进店问询」/ });
      expect(upBtn).toBeDisabled();
    });

    it("最后一个标签的「下移」按钮 disabled", () => {
      render(<TagManager {...defaultProps()} />);
      const downBtn = screen.getByRole("button", { name: /下移「电话回访」/ });
      expect(downBtn).toBeDisabled();
    });
  });

  describe("loading", () => {
    it("isLoading=true 时新增按钮 disabled", () => {
      render(<TagManager {...defaultProps()} isLoading />);
      expect(
        screen.getByRole("button", { name: /新增场景标签/ })
      ).toBeDisabled();
    });

    it("isLoading=true 时编辑/删除按钮 disabled", () => {
      render(<TagManager {...defaultProps()} isLoading />);
      expect(
        screen.getByRole("button", { name: /编辑标签「进店问询」/ })
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /删除标签「进店问询」/ })
      ).toBeDisabled();
    });
  });

  describe("不可变性", () => {
    it("传入 tags 数组未被修改", () => {
      const props = defaultProps();
      const original = [...props.tags];
      const originalSnapshot = JSON.stringify(original);
      render(<TagManager {...props} />);
      expect(JSON.stringify(props.tags)).toBe(originalSnapshot);
    });
  });
});
