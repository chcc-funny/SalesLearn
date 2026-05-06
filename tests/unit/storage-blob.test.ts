import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @vercel/blob before any imports
vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  del: vi.fn(),
  list: vi.fn(),
}));

// Mock lib/env
vi.mock("@/lib/env", () => ({
  env: {
    BLOB_READ_WRITE_TOKEN: "test-token-123",
  },
}));

import { put, del, list } from "@vercel/blob";
import { uploadFile, uploadImage, uploadAudio, deleteFile, listFiles } from "@/lib/storage/blob";

const mockPut = vi.mocked(put);
const mockDel = vi.mocked(del);
const mockList = vi.mocked(list);

function createFile(name: string, type: string, sizeBytes = 100): File {
  const content = "x".repeat(sizeBytes);
  return new File([content], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("uploadFile", () => {
  it("uploads a valid PDF file and returns UploadResult", async () => {
    mockPut.mockResolvedValue({
      url: "https://blob.example.com/docs/123_test.pdf",
      pathname: "docs/123_test.pdf",
      contentType: "application/pdf",
      contentDisposition: "",
      downloadUrl: "",
    } as any);

    const file = createFile("test.pdf", "application/pdf", 1000);
    const result = await uploadFile(file, "docs");

    expect(mockPut).toHaveBeenCalledOnce();
    expect(result.url).toBe("https://blob.example.com/docs/123_test.pdf");
    expect(result.contentType).toBe("application/pdf");
    expect(result.size).toBe(file.size);
  });

  it("throws on unsupported file type", async () => {
    const file = createFile("virus.exe", "application/x-msdownload");
    await expect(uploadFile(file, "docs")).rejects.toThrow("不支持的文件类型");
  });

  it("throws when file size exceeds 10MB", async () => {
    const oversized = createFile("big.txt", "text/plain", 11 * 1024 * 1024);
    await expect(uploadFile(oversized, "docs")).rejects.toThrow("文件大小超过限制");
  });

  it("sanitizes special characters in filename", async () => {
    mockPut.mockResolvedValue({
      url: "https://blob.example.com/docs/123_hello_world.txt",
      pathname: "docs/123_hello_world.txt",
      contentType: "text/plain",
      contentDisposition: "",
      downloadUrl: "",
    } as any);

    const file = createFile("hello world!.txt", "text/plain");
    await uploadFile(file, "docs");

    const callArgs = mockPut.mock.calls[0];
    const pathname = callArgs[0] as string;
    // Special chars replaced with underscore
    expect(pathname).toMatch(/docs\/\d+_hello_world_.txt/);
  });

  it("accepts all allowed file types without throwing", async () => {
    const allowedTypes = [
      ["test.pdf", "application/pdf"],
      ["test.txt", "text/plain"],
      ["test.md", "text/markdown"],
      ["test.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["test.jpg", "image/jpeg"],
      ["test.png", "image/png"],
      ["test.webp", "image/webp"],
    ];

    for (const [name, type] of allowedTypes) {
      mockPut.mockResolvedValue({
        url: `https://blob.example.com/${name}`,
        pathname: name,
        contentType: type,
        contentDisposition: "",
        downloadUrl: "",
      } as any);
      const file = createFile(name, type);
      await expect(uploadFile(file, "folder")).resolves.toBeDefined();
    }
  });
});

describe("uploadImage", () => {
  it("returns URL string for a valid image", async () => {
    mockPut.mockResolvedValue({
      url: "https://blob.example.com/images/photo.png",
      pathname: "images/photo.png",
      contentType: "image/png",
      contentDisposition: "",
      downloadUrl: "",
    } as any);

    const file = createFile("photo.png", "image/png");
    const url = await uploadImage(file);
    expect(url).toBe("https://blob.example.com/images/photo.png");
  });

  it("throws for non-image file type", async () => {
    const file = createFile("doc.pdf", "application/pdf");
    await expect(uploadImage(file)).rejects.toThrow("仅支持 JPG、PNG、WebP");
  });

  it("uses default folder 'images' when not specified", async () => {
    mockPut.mockResolvedValue({
      url: "https://blob.example.com/images/img.jpg",
      pathname: "images/img.jpg",
      contentType: "image/jpeg",
      contentDisposition: "",
      downloadUrl: "",
    } as any);

    const file = createFile("img.jpg", "image/jpeg");
    await uploadImage(file);

    const pathname = mockPut.mock.calls[0][0] as string;
    expect(pathname).toMatch(/^images\//);
  });
});

describe("uploadAudio", () => {
  it("uploads a valid webm audio blob", async () => {
    mockPut.mockResolvedValue({
      url: "https://blob.example.com/audio/recording.webm",
      pathname: "audio/recording.webm",
      contentType: "audio/webm",
      contentDisposition: "",
      downloadUrl: "",
    } as any);

    const blob = new Blob(["audio data"], { type: "audio/webm" });
    const result = await uploadAudio(blob, "recording.webm");

    expect(result.url).toBe("https://blob.example.com/audio/recording.webm");
    expect(result.contentType).toBe("audio/webm");
  });

  it("throws on unsupported audio type", async () => {
    const blob = new Blob(["data"], { type: "audio/ogg-vorbis-unsupported" });
    await expect(uploadAudio(blob, "file.ogg")).rejects.toThrow("不支持的音频格式");
  });

  it("throws when audio exceeds 25MB", async () => {
    const largeContent = "x".repeat(26 * 1024 * 1024);
    const blob = new Blob([largeContent], { type: "audio/wav" });
    await expect(uploadAudio(blob, "big.wav")).rejects.toThrow("音频文件大小超过限制");
  });

  it("handles audio/webm;codecs=opus by normalizing base type", async () => {
    mockPut.mockResolvedValue({
      url: "https://blob.example.com/audio/rec.webm",
      pathname: "audio/rec.webm",
      contentType: "audio/webm;codecs=opus",
      contentDisposition: "",
      downloadUrl: "",
    } as any);

    const blob = new Blob(["data"], { type: "audio/webm;codecs=opus" });
    await expect(uploadAudio(blob, "rec.webm")).resolves.toBeDefined();
  });
});

describe("deleteFile", () => {
  it("calls del with the provided URL and token", async () => {
    mockDel.mockResolvedValue(undefined as any);
    await deleteFile("https://blob.example.com/docs/file.pdf");
    expect(mockDel).toHaveBeenCalledWith(
      "https://blob.example.com/docs/file.pdf",
      { token: "test-token-123" }
    );
  });
});

describe("listFiles", () => {
  it("returns blobs array from Vercel list result", async () => {
    const fakeBlobs = [
      { url: "https://blob.example.com/docs/a.pdf", pathname: "docs/a.pdf", size: 100, uploadedAt: new Date() },
      { url: "https://blob.example.com/docs/b.pdf", pathname: "docs/b.pdf", size: 200, uploadedAt: new Date() },
    ];
    mockList.mockResolvedValue({ blobs: fakeBlobs, cursor: undefined, hasMore: false } as any);

    const result = await listFiles("docs/");
    expect(result).toEqual(fakeBlobs);
    expect(mockList).toHaveBeenCalledWith({ prefix: "docs/", token: "test-token-123" });
  });

  it("returns empty array when no blobs found", async () => {
    mockList.mockResolvedValue({ blobs: [], cursor: undefined, hasMore: false } as any);
    const result = await listFiles("empty/");
    expect(result).toEqual([]);
  });
});
