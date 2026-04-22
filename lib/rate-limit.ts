/**
 * 内存令牌桶限流器（MVP 阶段）
 *
 * 三种限流级别：
 * - auth: 认证接口 5次/分
 * - llm: LLM 接口 10次/分
 * - default: 普通接口 60次/分
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

interface RateLimitConfig {
  maxTokens: number;
  refillRate: number; // 每秒补充的 token 数
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  auth: { maxTokens: 5, refillRate: 5 / 60 },
  llm: { maxTokens: 10, refillRate: 10 / 60 },
  default: { maxTokens: 60, refillRate: 60 / 60 },
};

const store = new Map<string, RateLimitEntry>();

// 每 5 分钟清理过期条目
setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (now - entry.lastRefill > 5 * 60 * 1000) {
      store.delete(key);
    }
  });
}, 5 * 60 * 1000);

/**
 * 根据 API 路径判断限流类别
 */
export function getRateLimitType(pathname: string): string {
  if (pathname.startsWith("/api/auth")) return "auth";
  if (
    pathname.includes("/upload") ||
    pathname.includes("/generate") ||
    pathname.includes("/evaluate") ||
    pathname.includes("/transcribe") ||
    pathname.includes("/chat")
  ) {
    return "llm";
  }
  return "default";
}

/**
 * 检查请求是否被限流
 *
 * @returns null 表示通过，否则返回 { retryAfter } 秒数
 */
export function checkRateLimit(
  key: string,
  type: string
): { allowed: boolean; retryAfter: number } {
  const config = RATE_LIMITS[type] ?? RATE_LIMITS.default;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    store.set(key, { tokens: config.maxTokens - 1, lastRefill: now });
    return { allowed: true, retryAfter: 0 };
  }

  // 补充 token
  const elapsed = (now - entry.lastRefill) / 1000;
  const refilled = Math.min(
    config.maxTokens,
    entry.tokens + elapsed * config.refillRate
  );

  if (refilled < 1) {
    const waitTime = Math.ceil((1 - refilled) / config.refillRate);
    return { allowed: false, retryAfter: waitTime };
  }

  store.set(key, { tokens: refilled - 1, lastRefill: now });
  return { allowed: true, retryAfter: 0 };
}
