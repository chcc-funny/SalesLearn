import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks ----
const { mockUser, mockTranscribeAudio } = vi.hoisted(() => {
  const mockUser = {
    id: "user-0001",
    name: "测试用户",
    email: "user@example.com",
    role: "employee",
    tenantId: "tenant-0001",
  };

  const mockTranscribeAudio = vi.fn();

  return { mockUser, mockTranscribeAudio };
});

let currentUser = mockUser;

// Mock global fetch（用于下载音频 URL）
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/asr", () => ({
  transcribeAudio: mockTranscribeAudio,
  // ASRClientError 必须是真实可实例化的类，供路由 catch 分支判断 instanceof
  ASRClientError: class ASRClientError extends Error {
    public readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "ASRClientError";
      this.code = code;
    }
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function) => {
    return async (req: NextRequest) => {
      if (!currentUser) {
        const { errorResponse, ErrorCode } = await import("@/lib/api-response");
        return errorResponse("未登录，请先登录", ErrorCode.UNAUTHORIZED);
      }
      return handler(req, { user: currentUser });
    };
  }),
}));

import { POST } from "@/app/api/feynman/transcribe/route";

// ---- 工厂函数 ----

function makeJsonRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/feynman/transcribe", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

/** 模拟成功下载音频：返回一个包含 ArrayBuffer 的 Response */
function mockAudioDownloadOk(audioBytes = new Uint8Array([1, 2, 3])) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    arrayBuffer: () => Promise.resolve(audioBytes.buffer),
  });
}

/** 模拟音频下载失败 */
function mockAudioDownloadFail(status = 404) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: "Not Found",
  });
}

// ---- 测试套件 ----

describe("POST /api/feynman/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockUser;

    mockTranscribeAudio.mockResolvedValue({
      text: "这是转写后的文字内容",
      duration: 30,
      wordCount: 9,
    });
  });

  // ── 认证测试 ────────────────────────────────────────────────────────────────

  it("未登录用户返回 401 UNAUTHORIZED", async () => {
    (currentUser as unknown) = null;

    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/rec.webm",
      contentType: "audio/webm",
      duration: 30,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.code).toBe(2001);
  });

  // ── Zod 校验测试 ─────────────────────────────────────────────────────────────

  it("缺少 audioUrl 返回 400 VALIDATION_ERROR", async () => {
    const req = makeJsonRequest({
      contentType: "audio/webm",
      duration: 30,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("audioUrl 不是合法 URL 返回 400 VALIDATION_ERROR", async () => {
    const req = makeJsonRequest({
      audioUrl: "not-a-valid-url",
      contentType: "audio/webm",
      duration: 30,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("无效的音频 URL");
  });

  it("缺少 contentType 返回 400 VALIDATION_ERROR", async () => {
    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/rec.webm",
      duration: 30,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("duration 为 0 返回 400（必须大于 0）", async () => {
    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/rec.webm",
      contentType: "audio/webm",
      duration: 0,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("音频时长必须大于 0");
  });

  it("duration 为负数返回 400", async () => {
    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/rec.webm",
      contentType: "audio/webm",
      duration: -5,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe(1001);
  });

  it("请求体格式错误（非 JSON）返回 400", async () => {
    const req = new Request("http://localhost/api/feynman/transcribe", {
      method: "POST",
      body: "invalid-json-{{",
      headers: { "Content-Type": "application/json" },
    }) as unknown as NextRequest;

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
  });

  // ── 正常转写 ─────────────────────────────────────────────────────────────────

  it("正常转写：调用 fetch 下载音频 + transcribeAudio → 返回文本", async () => {
    mockAudioDownloadOk();

    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/rec.webm",
      contentType: "audio/webm",
      duration: 30,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.text).toBe("这是转写后的文字内容");
    expect(json.data.wordCount).toBe(9);
    expect(json.data.duration).toBe(30);

    // 验证 fetch 以正确的 URL 被调用
    expect(mockFetch).toHaveBeenCalledWith(
      "https://blob.example.com/audio/rec.webm"
    );
    // 验证 transcribeAudio 被调用，base64 + contentType + duration 传入
    expect(mockTranscribeAudio).toHaveBeenCalledWith(
      expect.any(String), // base64
      "audio/webm",
      30
    );
  });

  it("转写结果含 warning 字段：ASR 返回空文本时带提示", async () => {
    mockAudioDownloadOk();
    mockTranscribeAudio.mockResolvedValueOnce({
      text: "",
      duration: 10,
      wordCount: 0,
    });

    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/silence.webm",
      contentType: "audio/webm",
      duration: 10,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.text).toBe("");
    expect(json.data.wordCount).toBe(0);
    expect(json.data.warning).toBeDefined();
    expect(json.data.warning).toContain("未识别到语音内容");
  });

  it("转写仅含空白符视为空文本，返回 warning", async () => {
    mockAudioDownloadOk();
    mockTranscribeAudio.mockResolvedValueOnce({
      text: "   ",
      duration: 8,
      wordCount: 0,
    });

    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/noise.webm",
      contentType: "audio/webm",
      duration: 8,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.warning).toBeDefined();
  });

  // ── 音频下载失败 ──────────────────────────────────────────────────────────────

  it("音频 URL 下载失败（404）→ 返回 502 STORAGE_ERROR", async () => {
    mockAudioDownloadFail(404);

    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/missing.webm",
      contentType: "audio/webm",
      duration: 15,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.error).toContain("无法下载音频文件");
    // 下载失败时不应调用 ASR
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
  });

  // ── ASR 异常 ─────────────────────────────────────────────────────────────────

  it("ASRClientError 抛出 → 返回 502 ASR_ERROR 含错误信息", async () => {
    mockAudioDownloadOk();

    // 使用真实 ASRClientError 类（从 mock 模块取出）
    const { ASRClientError } = await import("@/lib/asr");
    mockTranscribeAudio.mockRejectedValueOnce(
      new ASRClientError("AUTH_FAILURE", "腾讯云认证失败")
    );

    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/rec.webm",
      contentType: "audio/webm",
      duration: 20,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.error).toContain("语音识别失败");
    expect(json.error).toContain("腾讯云认证失败");
    expect(json.code).toBe(4002); // ASR_ERROR
  });

  it("ASR 超时（ASRClientError POLL_TIMEOUT）→ 502 ASR_ERROR", async () => {
    mockAudioDownloadOk();

    const { ASRClientError } = await import("@/lib/asr");
    mockTranscribeAudio.mockRejectedValueOnce(
      new ASRClientError("POLL_TIMEOUT", "语音识别超时，请稍后重试")
    );

    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/long.webm",
      contentType: "audio/webm",
      duration: 120,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.error).toContain("语音识别超时");
    expect(json.code).toBe(4002);
  });

  it("ASR 抛出普通 Error（非 ASRClientError）→ 502 ASR_ERROR 使用消息", async () => {
    mockAudioDownloadOk();
    mockTranscribeAudio.mockRejectedValueOnce(new Error("意外的内部错误"));

    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/rec.webm",
      contentType: "audio/webm",
      duration: 30,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.error).toContain("意外的内部错误");
    expect(json.code).toBe(4002);
  });

  it("ASR 抛出非 Error 对象 → 502 ASR_ERROR 使用默认消息", async () => {
    mockAudioDownloadOk();
    mockTranscribeAudio.mockRejectedValueOnce("string error");

    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/rec.webm",
      contentType: "audio/webm",
      duration: 30,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.error).toBe("语音转文字失败");
  });

  // ── 长音频分支 ────────────────────────────────────────────────────────────────

  it("长音频（duration >= 60）→ transcribeAudio 被调用，路由层透传 duration", async () => {
    mockAudioDownloadOk();
    mockTranscribeAudio.mockResolvedValueOnce({
      text: "长音频转写内容",
      duration: 120,
      wordCount: 7,
    });

    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/long.webm",
      contentType: "audio/webm",
      duration: 120,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.text).toBe("长音频转写内容");
    // 路由层将 duration 透传给 transcribeAudio
    expect(mockTranscribeAudio).toHaveBeenCalledWith(
      expect.any(String),
      "audio/webm",
      120
    );
  });

  // ── 边界值 ───────────────────────────────────────────────────────────────────

  it("duration=1（最小合法值）正常处理", async () => {
    mockAudioDownloadOk();

    const req = makeJsonRequest({
      audioUrl: "https://blob.example.com/audio/short.webm",
      contentType: "audio/webm",
      duration: 1,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("audioUrl 包含查询参数和 hash 的合法 URL 能通过校验", async () => {
    mockAudioDownloadOk();

    const req = makeJsonRequest({
      audioUrl:
        "https://blob.vercel-storage.com/audio/rec.webm?token=abc&v=1",
      contentType: "audio/mp4",
      duration: 45,
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });
});
