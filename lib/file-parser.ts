import mammoth from "mammoth";

export type SupportedExt = ".txt" | ".md" | ".pdf" | ".docx";

const TEXT_EXTENSIONS = new Set([".txt", ".md"]);

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

async function parsePdf(buffer: Buffer): Promise<string> {
  // 动态导入避免 pdf-parse v1 在 webpack 打包时读取测试文件
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text;
}

/**
 * 从上传的 File 对象提取纯文本内容
 * 支持 .txt / .md / .pdf / .docx
 */
export async function extractText(file: File): Promise<string> {
  const ext = getExtension(file.name);

  if (TEXT_EXTENSIONS.has(ext)) {
    return file.text();
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === ".pdf") {
    return parsePdf(buffer);
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`不支持的文件格式: ${ext}，仅支持 .txt、.md、.pdf、.docx`);
}
