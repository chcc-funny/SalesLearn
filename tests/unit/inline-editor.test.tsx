import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InlineEditor } from "@/components/admin/knowledge/inline-editor";

describe("InlineEditor", () => {
  it("渲染传入的 value", () => {
    render(<InlineEditor value="hello" onChange={() => {}} />);
    const input = screen.getByRole("textbox");
    expect((input as HTMLInputElement).value).toBe("hello");
  });

  it("默认渲染 input（非 multiline）", () => {
    render(<InlineEditor value="" onChange={() => {}} />);
    expect(screen.getByRole("textbox").tagName).toBe("INPUT");
  });

  it("multiline=true 渲染 textarea", () => {
    render(<InlineEditor value="" onChange={() => {}} multiline />);
    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
  });

  it("multiline=false 渲染 input", () => {
    render(<InlineEditor value="" onChange={() => {}} multiline={false} />);
    expect(screen.getByRole("textbox").tagName).toBe("INPUT");
  });

  it("有 label 时显示 label 文字", () => {
    render(<InlineEditor value="" onChange={() => {}} label="标题" />);
    expect(screen.getByText("标题")).toBeInTheDocument();
  });

  it("无 label 时不渲染 label 元素", () => {
    render(<InlineEditor value="test" onChange={() => {}} />);
    expect(screen.queryByRole("label")).not.toBeInTheDocument();
  });

  it("输入时触发 onChange 回调", () => {
    const handleChange = vi.fn();
    render(<InlineEditor value="" onChange={handleChange} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "new text" },
    });
    expect(handleChange).toHaveBeenCalledWith("new text");
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it("multiline textarea 输入时触发 onChange", () => {
    const handleChange = vi.fn();
    render(<InlineEditor value="" onChange={handleChange} multiline />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "多行内容" },
    });
    expect(handleChange).toHaveBeenCalledWith("多行内容");
  });

  it("disabled=true 时 input 被禁用", () => {
    render(<InlineEditor value="test" onChange={() => {}} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("disabled=true 时 textarea 被禁用", () => {
    render(<InlineEditor value="test" onChange={() => {}} multiline disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("placeholder 传入到 input", () => {
    render(<InlineEditor value="" onChange={() => {}} placeholder="请输入" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "请输入");
  });

  it("label 与 input 通过 htmlFor 关联", () => {
    render(<InlineEditor value="" onChange={() => {}} label="内容" id="content-field" />);
    const label = screen.getByText("内容");
    expect(label).toHaveAttribute("for", "content-field");
    expect(screen.getByRole("textbox")).toHaveAttribute("id", "content-field");
  });

  it("有 label 但无 id 时自动生成 id 关联", () => {
    render(<InlineEditor value="" onChange={() => {}} label="关键词" />);
    const label = screen.getByText("关键词");
    const forAttr = label.getAttribute("for");
    expect(forAttr).toBeTruthy();
    expect(screen.getByRole("textbox")).toHaveAttribute("id", forAttr!);
  });
});
