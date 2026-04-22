import { put, del, list } from "@vercel/blob";
import { env } from "@/lib/env";

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB

interface UploadResult {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
}

/**
 * 上传文件到 Vercel Blob
 */
export async function uploadFile(
  file: File,
  folder: string
): Promise<UploadResult> {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    throw new Error(
      `不支持的文件类型: ${file.type}。支持: PDF, TXT, MD, DOCX, JPG, PNG, WebP`
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`文件大小超过限制（最大 10MB）`);
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `${folder}/${timestamp}_${safeName}`;

  const blob = await put(pathname, file, {
    access: "public",
    token: env.BLOB_READ_WRITE_TOKEN,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: file.type,
    size: file.size,
  };
}

/**
 * 上传图片到 Vercel Blob
 */
export async function uploadImage(
  file: File,
  folder = "images"
): Promise<string> {
  const imageTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!imageTypes.includes(file.type)) {
    throw new Error("仅支持 JPG、PNG、WebP 格式的图片");
  }

  const result = await uploadFile(file, folder);
  return result.url;
}

/**
 * 上传音频文件到 Vercel Blob
 */
export async function uploadAudio(
  file: Blob,
  fileName: string,
  folder = "audio"
): Promise<UploadResult> {
  const contentType = file.type || "audio/webm";

  // Normalize type (strip codecs param for matching)
  const baseType = contentType.split(";")[0];
  if (!ALLOWED_AUDIO_TYPES.some((t) => t.startsWith(baseType))) {
    throw new Error(
      `不支持的音频格式: ${contentType}。支持: WebM, OGG, MP4, MP3, WAV`
    );
  }

  if (file.size > MAX_AUDIO_SIZE) {
    throw new Error("音频文件大小超过限制（最大 25MB）");
  }

  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `${folder}/${timestamp}_${safeName}`;

  const blob = await put(pathname, file, {
    access: "public",
    token: env.BLOB_READ_WRITE_TOKEN,
    contentType,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType,
    size: file.size,
  };
}

/**
 * 删除 Vercel Blob 中的文件
 */
export async function deleteFile(url: string): Promise<void> {
  await del(url, { token: env.BLOB_READ_WRITE_TOKEN });
}

/**
 * 列出 Vercel Blob 中指定前缀的文件
 */
export async function listFiles(prefix: string) {
  const result = await list({
    prefix,
    token: env.BLOB_READ_WRITE_TOKEN,
  });
  return result.blobs;
}
