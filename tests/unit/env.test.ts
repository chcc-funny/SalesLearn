import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("env module", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original env after each test
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
    vi.resetModules();
  });

  describe("validateEnv", () => {
    it("returns valid:true when all required env vars are set", async () => {
      process.env.DATABASE_URL = "postgres://test";
      process.env.NEXTAUTH_SECRET = "secret123";
      process.env.OPENROUTER_API_KEY = "sk-or-test";

      const { validateEnv } = await import("@/lib/env");
      const result = validateEnv();
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("returns valid:false and lists missing keys when env vars are absent", async () => {
      delete process.env.DATABASE_URL;
      delete process.env.NEXTAUTH_SECRET;
      delete process.env.OPENROUTER_API_KEY;

      const { validateEnv } = await import("@/lib/env");
      const result = validateEnv();
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("DATABASE_URL");
      expect(result.missing).toContain("NEXTAUTH_SECRET");
      expect(result.missing).toContain("OPENROUTER_API_KEY");
    });

    it("returns partial missing list when only some vars are absent", async () => {
      process.env.DATABASE_URL = "postgres://test";
      delete process.env.NEXTAUTH_SECRET;
      delete process.env.OPENROUTER_API_KEY;

      const { validateEnv } = await import("@/lib/env");
      const result = validateEnv();
      expect(result.valid).toBe(false);
      expect(result.missing).not.toContain("DATABASE_URL");
      expect(result.missing).toContain("NEXTAUTH_SECRET");
      expect(result.missing).toContain("OPENROUTER_API_KEY");
    });
  });

  describe("env object", () => {
    it("getOptionalEnv returns default value when env var is absent", async () => {
      delete process.env.NEXTAUTH_URL;

      const { env } = await import("@/lib/env");
      expect(env.NEXTAUTH_URL).toBe("http://localhost:3000");
    });

    it("getOptionalEnv returns the actual value when env var is set", async () => {
      process.env.NEXTAUTH_URL = "https://example.com";

      const { env } = await import("@/lib/env");
      expect(env.NEXTAUTH_URL).toBe("https://example.com");
    });

    it("getRequiredEnv throws when a required env var is missing", async () => {
      delete process.env.DATABASE_URL;

      const { env } = await import("@/lib/env");
      expect(() => env.DATABASE_URL).toThrow("DATABASE_URL");
    });

    it("BLOB_READ_WRITE_TOKEN defaults to empty string when absent", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;

      const { env } = await import("@/lib/env");
      expect(env.BLOB_READ_WRITE_TOKEN).toBe("");
    });
  });
});
