import { env } from "@/lib/env";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** 预定义模型常量 */
export const LLM_MODELS = {
  /** 知识切分、出题 — 成本优化 */
  KIMI_K2: "moonshotai/kimi-k2",
  /** 费曼评分、客户追问 — 质量优先 */
  CLAUDE_SONNET: "anthropic/claude-sonnet-4-20250514",
  /** 短文本任务 — 成本优化 */
  CLAUDE_HAIKU: "anthropic/claude-haiku-4-5-20251001",
} as const;

export type ModelId = (typeof LLM_MODELS)[keyof typeof LLM_MODELS];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionOptions {
  model: ModelId;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** 要求 JSON 输出 */
  jsonMode?: boolean;
}

interface ChatCompletionResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 调用 OpenRouter Chat Completion API
 */
async function fetchCompletion(
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  const { model, messages, temperature = 0.7, maxTokens = 4096, jsonMode } = options;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://saleslearn.vercel.app",
      "X-Title": "SalesLearn",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter API 错误 (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  if (!choice?.message?.content) {
    throw new Error("OpenRouter 返回空响应");
  }

  return {
    content: choice.message.content,
    model: data.model ?? model,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
  };
}

/**
 * 带重试的 LLM 调用
 *
 * @param options - 调用选项
 * @param maxRetries - 最大重试次数（默认 2）
 */
export async function chatCompletion(
  options: ChatCompletionOptions,
  maxRetries = 2
): Promise<ChatCompletionResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchCompletion(options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 指数退避: 1s, 2s
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error("LLM 调用失败");
}

/**
 * 调用 LLM 并解析 JSON 响应
 */
export async function chatCompletionJSON<T>(
  options: Omit<ChatCompletionOptions, "jsonMode">
): Promise<{ data: T; usage: ChatCompletionResult["usage"] }> {
  const result = await chatCompletion({ ...options, jsonMode: true });

  try {
    const data = JSON.parse(result.content) as T;
    return { data, usage: result.usage };
  } catch {
    throw new Error("LLM 返回的 JSON 格式无效");
  }
}

export type ChatCompletionStreamOptions = Omit<ChatCompletionOptions, "jsonMode">;

/**
 * 流式调用 OpenRouter Chat Completion API
 *
 * 返回 ReadableStream，逐 chunk 输出文本 token（UTF-8 编码）
 */
export async function chatCompletionStream(
  options: ChatCompletionStreamOptions
): Promise<ReadableStream<Uint8Array>> {
  const { model, messages, temperature = 0.7, maxTokens = 4096 } = options;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://saleslearn.vercel.app",
      "X-Title": "SalesLearn",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter API 错误 (${response.status}): ${errorText}`
    );
  }

  if (!response.body) {
    throw new Error("OpenRouter 返回空的响应流");
  }

  return parseSSEStream(response.body);
}

/**
 * 解析 SSE 字节流，提取文本 token 并输出为 ReadableStream
 */
function parseSSEStream(
  source: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // 处理 buffer 中可能残留的最后一行
            processLines(buffer, controller, encoder);
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // 最后一个元素可能是不完整行，保留在 buffer 中
          buffer = lines.pop() ?? "";

          const shouldClose = processLines(
            lines.join("\n"),
            controller,
            encoder
          );

          if (shouldClose) {
            controller.close();
            reader.cancel();
            return;
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * 逐行处理 SSE 数据，提取 delta.content 并 enqueue
 *
 * @returns true 表示遇到 [DONE]，应关闭流
 */
function processLines(
  text: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): boolean {
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith(":")) {
      continue;
    }

    if (!trimmed.startsWith("data:")) {
      continue;
    }

    const payload = trimmed.slice("data:".length).trim();

    if (payload === "[DONE]") {
      return true;
    }

    try {
      const parsed = JSON.parse(payload) as {
        choices?: Array<{
          delta?: { content?: string };
        }>;
      };

      const content = parsed.choices?.[0]?.delta?.content;

      if (content) {
        controller.enqueue(encoder.encode(content));
      }
    } catch {
      // 跳过无法解析的行
    }
  }

  return false;
}
