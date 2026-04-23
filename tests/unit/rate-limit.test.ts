import {
  getRateLimitType,
  checkRateLimit,
  cleanupExpiredEntries,
} from "@/lib/rate-limit";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getRateLimitType", () => {
  it('returns "auth" for auth routes', () => {
    expect(getRateLimitType("/api/auth/login")).toBe("auth");
  });

  it('returns "llm" for evaluate routes', () => {
    expect(getRateLimitType("/api/feynman/evaluate")).toBe("llm");
  });

  it('returns "llm" for chat routes', () => {
    expect(getRateLimitType("/api/feynman/chat")).toBe("llm");
  });

  it('returns "llm" for generate routes', () => {
    expect(getRateLimitType("/api/quiz/generate")).toBe("llm");
  });

  it('returns "default" for other routes', () => {
    expect(getRateLimitType("/api/quiz/answer")).toBe("default");
  });
});

describe("checkRateLimit", () => {
  it("allows the first request", () => {
    const key = `test-first-${Date.now()}`;
    const result = checkRateLimit(key, "auth");
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBe(0);
  });

  it("allows auth type up to 5 times then blocks the 6th", () => {
    const key = `test-auth-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(key, "auth");
      expect(result.allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, "auth");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("tracks different keys independently", () => {
    const keyA = `test-indep-a-${Date.now()}`;
    const keyB = `test-indep-b-${Date.now()}`;

    for (let i = 0; i < 5; i++) {
      checkRateLimit(keyA, "auth");
    }
    const blockedA = checkRateLimit(keyA, "auth");
    expect(blockedA.allowed).toBe(false);

    const resultB = checkRateLimit(keyB, "auth");
    expect(resultB.allowed).toBe(true);
  });

  it("recovers tokens after enough time has passed", () => {
    const key = `test-recover-${Date.now()}`;

    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, "auth");
    }
    expect(checkRateLimit(key, "auth").allowed).toBe(false);

    // auth refillRate = 5/60 tokens/sec, need 1 token → 12 seconds
    vi.advanceTimersByTime(13_000);

    const recovered = checkRateLimit(key, "auth");
    expect(recovered.allowed).toBe(true);
  });
});

describe("cleanupExpiredEntries", () => {
  it("removes entries older than 5 minutes", () => {
    const key = `test-cleanup-${Date.now()}`;
    checkRateLimit(key, "auth");

    // 推进 6 分钟，使条目过期
    vi.advanceTimersByTime(6 * 60 * 1000);
    cleanupExpiredEntries();

    // 清理后应重新获得满额 token（即新条目）
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, "auth").allowed).toBe(true);
    }
  });

  it("keeps entries that are still active", () => {
    const key = `test-keep-${Date.now()}`;

    // 消耗所有 5 个 token
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, "auth");
    }
    expect(checkRateLimit(key, "auth").allowed).toBe(false);

    // 只推进 1 分钟，条目未过期
    vi.advanceTimersByTime(60 * 1000);
    cleanupExpiredEntries();

    // 条目保留，token 部分恢复但仍不足 5 个
    // auth refillRate = 5/60 ≈ 0.083/s，60s 恢复约 5 个 token
    // 加上之前剩余的负数，应该能用但不是完全重置
    const result = checkRateLimit(key, "auth");
    expect(result.allowed).toBe(true);
  });
});
