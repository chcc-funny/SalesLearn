import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { uploadAudio } from "@/lib/storage/blob";

/** Max audio file size: 25MB */
const MAX_SIZE = 25 * 1024 * 1024;

/**
 * POST /api/feynman/upload-audio
 * Upload recorded audio to Vercel Blob storage.
 * Returns the stored URL and metadata for subsequent transcription.
 */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const durationStr = formData.get("duration") as string | null;

    if (!file) {
      return errorResponse("请上传音频文件", ErrorCode.VALIDATION_ERROR);
    }

    if (file.size > MAX_SIZE) {
      return errorResponse(
        "音频文件大小超过限制（最大 25MB）",
        ErrorCode.FILE_TOO_LARGE
      );
    }

    if (file.size === 0) {
      return errorResponse("音频文件为空", ErrorCode.VALIDATION_ERROR);
    }

    const duration = durationStr ? parseInt(durationStr, 10) : 0;

    // Upload to Vercel Blob under tenant-scoped path
    const folder = `audio/${user.tenantId}/${user.id}`;
    const result = await uploadAudio(file, file.name, folder);

    return successResponse({
      url: result.url,
      pathname: result.pathname,
      contentType: result.contentType,
      size: result.size,
      duration,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "音频上传失败";
    return errorResponse(message, ErrorCode.STORAGE_ERROR);
  }
});
