import { env } from "@/lib/env";
import { generateSignedHeaders } from "./tencent-signature";

const ASR_ENDPOINT = "https://asr.tencentcloudapi.com";
const ASR_SERVICE = "asr";

/** Supported audio formats for Tencent ASR */
const FORMAT_MAP: Record<string, string> = {
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

/** Max audio duration in seconds */
const MAX_AUDIO_DURATION = 600;

/** Max retry attempts */
const MAX_RETRIES = 2;

/** Retry delay base in ms */
const RETRY_BASE_DELAY = 1000;

export interface ASRResult {
  text: string;
  duration: number;
  wordCount: number;
}

export interface ASRError {
  code: string;
  message: string;
}

/**
 * Validate ASR configuration is present.
 */
export function validateASRConfig(): { valid: boolean; missing: string[] } {
  const required = ["TENCENT_SECRET_ID", "TENCENT_SECRET_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  return { valid: missing.length === 0, missing };
}

/**
 * Transcribe audio to text using Tencent Cloud ASR.
 * Uses the "SentenceRecognition" API for short audio (< 1 min)
 * or "CreateRecTask" for longer audio.
 *
 * @param audioData - Base64-encoded audio data
 * @param contentType - MIME type of the audio
 * @param duration - Audio duration in seconds
 */
export async function transcribeAudio(
  audioData: string,
  contentType: string,
  duration: number
): Promise<ASRResult> {
  const config = validateASRConfig();
  if (!config.valid) {
    throw new ASRClientError(
      "ASR_CONFIG_MISSING",
      `缺少腾讯云 ASR 配置: ${config.missing.join(", ")}`
    );
  }

  if (duration > MAX_AUDIO_DURATION) {
    throw new ASRClientError(
      "AUDIO_TOO_LONG",
      `音频时长 ${duration}s 超过限制 ${MAX_AUDIO_DURATION}s`
    );
  }

  const format = FORMAT_MAP[contentType.split(";")[0]];
  if (!format) {
    throw new ASRClientError(
      "UNSUPPORTED_FORMAT",
      `不支持的音频格式: ${contentType}`
    );
  }

  // Short audio (< 60s): use SentenceRecognition
  // Long audio (>= 60s): use CreateRecTask + polling
  if (duration < 60) {
    return sentenceRecognition(audioData, format);
  }
  return longAudioRecognition(audioData, format);
}

/**
 * Short audio recognition (< 60s).
 * Synchronous API call.
 */
async function sentenceRecognition(
  audioData: string,
  format: string
): Promise<ASRResult> {
  const payload = JSON.stringify({
    EngSerViceType: "16k_zh",
    SourceType: 1,
    VoiceFormat: format,
    Data: audioData,
    DataLen: audioData.length,
  });

  const response = await callASRApi("SentenceRecognition", payload);

  if (response.Response?.Error) {
    throw asrErrorFromResponse(response.Response.Error);
  }

  const text = response.Response?.Result ?? "";
  return {
    text: text.trim(),
    duration: response.Response?.AudioDuration ?? 0,
    wordCount: text.trim().length,
  };
}

/**
 * Long audio recognition (>= 60s).
 * Creates an async task and polls for result.
 */
async function longAudioRecognition(
  audioData: string,
  format: string
): Promise<ASRResult> {
  // Create recognition task
  const createPayload = JSON.stringify({
    EngineModelType: "16k_zh",
    ChannelNum: 1,
    SourceType: 1,
    VoiceFormat: format,
    Data: audioData,
    DataLen: audioData.length,
  });

  const createResponse = await callASRApi("CreateRecTask", createPayload);

  if (createResponse.Response?.Error) {
    throw asrErrorFromResponse(createResponse.Response.Error);
  }

  const taskId = createResponse.Response?.Data?.TaskId;
  if (!taskId) {
    throw new ASRClientError("TASK_CREATE_FAILED", "创建识别任务失败");
  }

  // Poll for result (max 60 attempts, 2s interval = 2 min timeout)
  return pollTaskResult(taskId);
}

async function pollTaskResult(taskId: number): Promise<ASRResult> {
  const maxAttempts = 60;
  const pollInterval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(pollInterval);

    const payload = JSON.stringify({ TaskId: taskId });
    const response = await callASRApi("DescribeTaskStatus", payload);

    if (response.Response?.Error) {
      throw asrErrorFromResponse(response.Response.Error);
    }

    const status = response.Response?.Data?.StatusStr;

    if (status === "success") {
      const text = response.Response?.Data?.Result ?? "";
      return {
        text: text.trim(),
        duration: response.Response?.Data?.AudioDuration ?? 0,
        wordCount: text.trim().length,
      };
    }

    if (status === "failed") {
      throw new ASRClientError(
        "RECOGNITION_FAILED",
        response.Response?.Data?.ErrorMsg ?? "语音识别失败"
      );
    }

    // status === "waiting" or "doing" → continue polling
  }

  throw new ASRClientError("POLL_TIMEOUT", "语音识别超时，请稍后重试");
}

/**
 * Call Tencent Cloud ASR API with retry.
 */
async function callASRApi(
  action: string,
  payload: string,
  retries = MAX_RETRIES
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const timestamp = Math.floor(Date.now() / 1000);

  const headers = generateSignedHeaders({
    secretId: env.TENCENT_SECRET_ID,
    secretKey: env.TENCENT_SECRET_KEY,
    service: ASR_SERVICE,
    action,
    payload,
    timestamp,
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(ASR_ENDPOINT, {
        method: "POST",
        headers: {
          ...headers,
          Host: "asr.tencentcloudapi.com",
        },
        body: payload,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt === retries) {
        throw new ASRClientError(
          "API_REQUEST_FAILED",
          error instanceof Error
            ? `ASR 请求失败: ${error.message}`
            : "ASR 请求失败"
        );
      }
      // Exponential backoff
      await sleep(RETRY_BASE_DELAY * Math.pow(2, attempt));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asrErrorFromResponse(error: any): ASRClientError {
  return new ASRClientError(
    error.Code ?? "UNKNOWN",
    error.Message ?? "腾讯云 ASR 返回未知错误"
  );
}

/**
 * ASR client error with code for upstream handling.
 */
export class ASRClientError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ASRClientError";
    this.code = code;
  }
}
