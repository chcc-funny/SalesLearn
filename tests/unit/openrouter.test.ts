import { describe, it, expect, vi, afterEach } from "vitest";
import { LLM_MODELS, chatCompletion, chatCompletionJSON, chatCompletionStream } from "@/lib/llm/openrouter";

// Mock the env module so OPENROUTER_API_KEY doesn't throw
vi.mock("@/lib/env", () => ({
  env: {
    OPENROUTER_API_KEY: "test-api-key",
  },
}));

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeOkResponse(content: string, model = "test-model") {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(""),
    json: () =>
      Promise.resolve({
        choices: [{ message: { content } }],
        model,
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

/** Creates a fake SSE ReadableStream that emits the given tokens then [DONE] */
function makeSSEStream(tokens: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = tokens.map(
    (t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`
  );
  lines.push("data: [DONE]\n\n");
  const combined = lines.join("");

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(combined));
      controller.close();
    },
  });
}

// ─────────────────────────────────────────────────────────────
// LLM_MODELS constants
// ─────────────────────────────────────────────────────────────

describe("LLM_MODELS", () => {
  it("exposes KIMI_K2, CLAUDE_SONNET and CLAUDE_HAIKU", () => {
    expect(LLM_MODELS.KIMI_K2).toBeDefined();
    expect(LLM_MODELS.CLAUDE_SONNET).toBeDefined();
    expect(LLM_MODELS.CLAUDE_HAIKU).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// chatCompletion
// ─────────────────────────────────────────────────────────────

describe("chatCompletion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: returns content, model and usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeOkResponse("Hello world", "anthropic/claude-sonnet-4"))
    );

    const result = await chatCompletion({
      model: LLM_MODELS.CLAUDE_SONNET,
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("Hello world");
    expect(result.model).toBe("anthropic/claude-sonnet-4");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  });

  it("sends Authorization header with Bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await chatCompletion({
      model: LLM_MODELS.CLAUDE_HAIKU,
      messages: [{ role: "user", content: "test" }],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-api-key");
  });

  it("adds response_format json_object for supported models when jsonMode=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    await chatCompletion({
      model: LLM_MODELS.CLAUDE_SONNET,
      messages: [{ role: "user", content: "x" }],
      jsonMode: true,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("does NOT add response_format for unsupported models (KIMI_K2)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse("plain text"));
    vi.stubGlobal("fetch", fetchMock);

    await chatCompletion({
      model: LLM_MODELS.KIMI_K2,
      messages: [{ role: "user", content: "x" }],
      jsonMode: true,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toBeUndefined();
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeErrorResponse(429, "rate limited")));

    // maxRetries=0 to avoid exponential backoff delay
    await expect(
      chatCompletion({ model: LLM_MODELS.CLAUDE_HAIKU, messages: [] }, 0)
    ).rejects.toThrow("OpenRouter API 错误 (429)");
  });

  it("throws when choices[0].message.content is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [], model: "x", usage: {} }),
        text: () => Promise.resolve(""),
      } as unknown as Response)
    );

    // maxRetries=0 to avoid exponential backoff delay
    await expect(
      chatCompletion({ model: LLM_MODELS.CLAUDE_HAIKU, messages: [] }, 0)
    ).rejects.toThrow("OpenRouter 返回空响应");
  });

  it("retries on failure and eventually throws after maxRetries exhausted", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    // maxRetries=0 avoids backoff sleep; we verify call count (1 attempt) and error message
    await expect(
      chatCompletion({ model: LLM_MODELS.CLAUDE_HAIKU, messages: [] }, 0)
    ).rejects.toThrow("network down");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("with maxRetries=1 fetch is called twice on persistent failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeErrorResponse(500, "server error"))
      .mockResolvedValueOnce(makeErrorResponse(500, "server error"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chatCompletion({ model: LLM_MODELS.CLAUDE_HAIKU, messages: [] }, 1)
    ).rejects.toThrow("OpenRouter API 错误 (500)");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws AbortError-flavored message on timeout", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(
      chatCompletion({ model: LLM_MODELS.CLAUDE_HAIKU, messages: [] }, 0)
    ).rejects.toThrow("OpenRouter 请求超时");
  });
});

// ─────────────────────────────────────────────────────────────
// chatCompletionJSON
// ─────────────────────────────────────────────────────────────

describe("chatCompletionJSON", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a plain JSON response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeOkResponse('{"foo":"bar"}')));

    const { data } = await chatCompletionJSON<{ foo: string }>({
      model: LLM_MODELS.CLAUDE_SONNET,
      messages: [{ role: "user", content: "x" }],
    });

    expect(data).toEqual({ foo: "bar" });
  });

  it("parses JSON wrapped in a markdown code block", async () => {
    const raw = '```json\n{"items":[1,2,3]}\n```';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeOkResponse(raw)));

    const { data } = await chatCompletionJSON<{ items: number[] }>({
      model: LLM_MODELS.CLAUDE_SONNET,
      messages: [{ role: "user", content: "x" }],
    });

    expect(data.items).toEqual([1, 2, 3]);
  });

  it("throws when LLM returns non-JSON content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeOkResponse("not json at all")));

    await expect(
      chatCompletionJSON({ model: LLM_MODELS.CLAUDE_HAIKU, messages: [] })
    ).rejects.toThrow("LLM 返回的 JSON 格式无效");
  });

  it("returns usage stats alongside parsed data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeOkResponse('{"v":1}')));

    const { usage } = await chatCompletionJSON<{ v: number }>({
      model: LLM_MODELS.CLAUDE_SONNET,
      messages: [],
    });

    expect(usage.totalTokens).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────
// chatCompletionStream
// ─────────────────────────────────────────────────────────────

describe("chatCompletionStream", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a ReadableStream that emits SSE tokens as Uint8Array chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: makeSSEStream(["Hello", " world"]),
        text: () => Promise.resolve(""),
      } as unknown as Response)
    );

    const stream = await chatCompletionStream({
      model: LLM_MODELS.CLAUDE_SONNET,
      messages: [{ role: "user", content: "hi" }],
    });

    const decoder = new TextDecoder();
    let output = "";
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }

    expect(output).toBe("Hello world");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeErrorResponse(503, "service unavailable"))
    );

    await expect(
      chatCompletionStream({ model: LLM_MODELS.CLAUDE_HAIKU, messages: [] })
    ).rejects.toThrow("OpenRouter API 错误 (503)");
  });

  it("throws when response.body is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: null,
        text: () => Promise.resolve(""),
      } as unknown as Response)
    );

    await expect(
      chatCompletionStream({ model: LLM_MODELS.CLAUDE_HAIKU, messages: [] })
    ).rejects.toThrow("OpenRouter 返回空的响应流");
  });
});
