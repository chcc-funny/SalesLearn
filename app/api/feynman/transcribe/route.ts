import { type NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/guard";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "@/lib/api-response";
import { transcribeAudio, ASRClientError } from "@/lib/asr";

const transcribeSchema = z.object({
  audioUrl: z.string().url("无效的音频 URL"),
  contentType: z.string().min(1, "缺少音频格式"),
  duration: z.number().int().min(1, "音频时长必须大于 0"),
});

/**
 * POST /api/feynman/transcribe
 * Download audio from Blob URL, encode to base64, send to Tencent ASR.
 */
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = transcribeSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      return errorResponse(message, ErrorCode.VALIDATION_ERROR);
    }

    const { audioUrl, contentType, duration } = parsed.data;

    // Download audio from Vercel Blob
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return errorResponse(
        "无法下载音频文件",
        ErrorCode.STORAGE_ERROR
      );
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // Call Tencent ASR
    const result = await transcribeAudio(audioBase64, contentType, duration);

    if (!result.text || result.text.trim().length === 0) {
      return successResponse({
        text: "",
        duration: result.duration,
        wordCount: 0,
        warning: "未识别到语音内容，请确认录音是否正常",
      });
    }

    return successResponse({
      text: result.text,
      duration: result.duration,
      wordCount: result.wordCount,
    });
  } catch (err) {
    if (err instanceof ASRClientError) {
      return errorResponse(
        `语音识别失败: ${err.message}`,
        ErrorCode.ASR_ERROR
      );
    }

    const message =
      err instanceof Error ? err.message : "语音转文字失败";
    return errorResponse(message, ErrorCode.ASR_ERROR);
  }
});
