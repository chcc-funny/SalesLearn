import { describe, it, expect, vi } from "vitest";

// Top-level mocks (hoisted before imports)
vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({ value: "DOCX内容", messages: [] }),
  },
}));

vi.mock("pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({ text: "PDF内容" }),
}));

import { extractText } from "@/lib/file-parser";

function createFile(name: string, content: string, type = "text/plain"): File {
  return new File([content], name, { type });
}

describe("extractText", () => {
  it("解析 .txt 文件", async () => {
    const file = createFile("test.txt", "Hello World 你好");
    const text = await extractText(file);
    expect(text).toBe("Hello World 你好");
  });

  it("解析 .md 文件", async () => {
    const file = createFile("test.md", "# 标题\n内容");
    const text = await extractText(file);
    expect(text).toBe("# 标题\n内容");
  });

  it("不支持的格式抛出错误", async () => {
    const file = createFile("test.xyz", "data");
    await expect(extractText(file)).rejects.toThrow("不支持的文件格式");
  });

  it("空内容的 txt 文件正常返回空字符串", async () => {
    const file = createFile("empty.txt", "");
    const text = await extractText(file);
    expect(text).toBe("");
  });

  it("没有扩展名的文件抛出不支持错误", async () => {
    const file = createFile("README", "some content");
    await expect(extractText(file)).rejects.toThrow("不支持的文件格式");
  });

  it("扩展名大写时同样有效（.TXT）", async () => {
    // Extension is lowercased internally
    const file = createFile("test.TXT", "大写扩展名");
    const text = await extractText(file);
    expect(text).toBe("大写扩展名");
  });

  it("解析 .pdf 文件（mock pdf-parse）", async () => {
    const arrayBuffer = new ArrayBuffer(8);
    const pdfFile = new File([arrayBuffer], "doc.pdf", { type: "application/pdf" });
    const text = await extractText(pdfFile);
    expect(text).toBe("PDF内容");
  });

  it("解析 .docx 文件（mock mammoth）", async () => {
    const arrayBuffer = new ArrayBuffer(8);
    const docxFile = new File(
      [arrayBuffer],
      "doc.docx",
      { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
    );
    const text = await extractText(docxFile);
    expect(text).toBe("DOCX内容");
  });

  it("错误信息包含不支持的扩展名", async () => {
    const file = createFile("test.xyz", "data");
    await expect(extractText(file)).rejects.toThrow(".xyz");
  });

  it("多个点的文件名取最后一个扩展名", async () => {
    const file = createFile("archive.backup.txt", "多点文件名");
    const text = await extractText(file);
    expect(text).toBe("多点文件名");
  });
});
