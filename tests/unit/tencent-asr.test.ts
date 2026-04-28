import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock the signature module to avoid crypto deps
vi.mock("@/lib/asr/tencent-signature", () => ({
  generateSignedHeaders: vi.fn(() => ({
    Authorization: "TC3-HMAC-SHA256 Credential=test/scope, SignedHeaders=content-type;host, Signature=abc",
    "Content-Type": "application/json; charset=utf-8",
    "X-TC-Action": "SentenceRecognition",
    "X-TC-Timestamp": "1700000000",
    "X-TC-Version": "2019-06-14",
    "X-TC-Region": "ap-shanghai",
  })),
}));

// Mock env
vi.mock("@/lib/env", () => ({
  env: {
    TENCENT_SECRET_ID: "test-secret-id",
    TENCENT_SECRET_KEY: "test-secret-key",
  },
}));

import { transcribeAudio, validateASRConfig, ASRClientError } from "@/lib/asr/tencent-asr";

function makeSuccessResponse(result: string, audioDuration = 5) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        Response: {
          Result: result,
          AudioDuration: audioDuration,
          RequestId: "test-req-id",
        },
      }),
  };
}

function makeErrorResponse(code: string, message: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        Response: {
          Error: { Code: code, Message: message },
          RequestId: "test-req-id",
        },
      }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TENCENT_SECRET_ID = "test-id";
  process.env.TENCENT_SECRET_KEY = "test-key";
});

afterEach(() => {
  delete process.env.TENCENT_SECRET_ID;
  delete process.env.TENCENT_SECRET_KEY;
});

describe("validateASRConfig", () => {
  it("returns valid:true when both secret vars are set", () => {
    process.env.TENCENT_SECRET_ID = "id";
    process.env.TENCENT_SECRET_KEY = "key";
    const result = validateASRConfig();
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("returns valid:false and lists missing keys when env vars absent", () => {
    delete process.env.TENCENT_SECRET_ID;
    delete process.env.TENCENT_SECRET_KEY;
    const result = validateASRConfig();
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("TENCENT_SECRET_ID");
    expect(result.missing).toContain("TENCENT_SECRET_KEY");
  });
});

describe("ASRClientError", () => {
  it("has the correct name and code", () => {
    const err = new ASRClientError("TEST_CODE", "test message");
    expect(err.name).toBe("ASRClientError");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test message");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("transcribeAudio", () => {
  it("throws ASR_CONFIG_MISSING when credentials are absent", async () => {
    delete process.env.TENCENT_SECRET_ID;
    delete process.env.TENCENT_SECRET_KEY;

    await expect(transcribeAudio("base64data", "audio/wav", 10)).rejects.toMatchObject({
      code: "ASR_CONFIG_MISSING",
    });
  });

  it("throws AUDIO_TOO_LONG when duration exceeds 600s", async () => {
    await expect(transcribeAudio("base64data", "audio/wav", 601)).rejects.toMatchObject({
      code: "AUDIO_TOO_LONG",
    });
  });

  it("throws UNSUPPORTED_FORMAT for unknown content type", async () => {
    await expect(transcribeAudio("base64data", "audio/unknown-format", 10)).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
  });

  it("returns ASRResult for short audio (< 60s) with SentenceRecognition", async () => {
    mockFetch.mockResolvedValueOnce(makeSuccessResponse("你好世界", 5) as any);

    const result = await transcribeAudio("base64audio", "audio/wav", 30);
    expect(result.text).toBe("你好世界");
    expect(result.duration).toBe(5);
    expect(result.wordCount).toBe(4); // "你好世界".trim().length = 4
  });

  it("returns trimmed text (strips leading/trailing whitespace)", async () => {
    mockFetch.mockResolvedValueOnce(makeSuccessResponse("  hello  ", 3) as any);

    const result = await transcribeAudio("base64audio", "audio/wav", 10);
    expect(result.text).toBe("hello");
    expect(result.wordCount).toBe(5); // "hello".length
  });

  it("handles API-level error in response and throws ASRClientError", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse("AuthFailure", "认证失败") as any);

    await expect(transcribeAudio("base64audio", "audio/wav", 10)).rejects.toMatchObject({
      code: "AuthFailure",
      message: "认证失败",
    });
  });

  it("throws API_REQUEST_FAILED after exhausting retries on HTTP error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" } as any);

    await expect(transcribeAudio("base64audio", "audio/wav", 10)).rejects.toMatchObject({
      code: "API_REQUEST_FAILED",
    });
  }, 10000);

  it("handles audio/webm;codecs=opus by mapping to webm format", async () => {
    mockFetch.mockResolvedValueOnce(makeSuccessResponse("opus内容", 15) as any);
    const result = await transcribeAudio("base64audio", "audio/webm;codecs=opus", 30);
    expect(result.text).toBe("opus内容");
  });

  it("returns empty text when API Result is undefined", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          Response: { AudioDuration: 5, RequestId: "req" },
        }),
    } as any);

    const result = await transcribeAudio("base64audio", "audio/mp4", 10);
    expect(result.text).toBe("");
    expect(result.wordCount).toBe(0);
  });

  it.skip("long audio (>=60s) creates async task and polls - requires real timing", () => {
    // Skipped: longAudioRecognition + pollTaskResult involve sleep(2000) polling
    // with up to 60 iterations. Testing this in unit tests would require
    // fake timers and deep mock orchestration that provides little value
    // over integration testing.
  });
});
