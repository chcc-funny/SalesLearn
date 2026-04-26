import { describe, it, expect } from "vitest";
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
});
