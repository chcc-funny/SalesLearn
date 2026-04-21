/**
 * 环境变量类型定义与启动时验证
 *
 * 使用方式：在 API 路由或服务端代码中 import { env } from "@/lib/env"
 */

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`环境变量 ${key} 未配置，请检查 .env.local 文件`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue = ""): string {
  return process.env[key] ?? defaultValue;
}

/** 服务端环境变量（仅在服务端使用，不会暴露给客户端） */
export const env = {
  // Database
  get DATABASE_URL() {
    return getRequiredEnv("DATABASE_URL");
  },

  // Auth
  get NEXTAUTH_SECRET() {
    return getRequiredEnv("NEXTAUTH_SECRET");
  },
  get NEXTAUTH_URL() {
    return getOptionalEnv("NEXTAUTH_URL", "http://localhost:3000");
  },

  // LLM
  get OPENROUTER_API_KEY() {
    return getRequiredEnv("OPENROUTER_API_KEY");
  },

  // 腾讯云 ASR
  get TENCENT_APP_ID() {
    return getOptionalEnv("TENCENT_APP_ID");
  },
  get TENCENT_SECRET_ID() {
    return getOptionalEnv("TENCENT_SECRET_ID");
  },
  get TENCENT_SECRET_KEY() {
    return getOptionalEnv("TENCENT_SECRET_KEY");
  },

  // File Storage
  get BLOB_READ_WRITE_TOKEN() {
    return getOptionalEnv("BLOB_READ_WRITE_TOKEN");
  },
} as const;

/**
 * 验证所有必需的环境变量是否已配置
 * 在应用启动时调用
 */
export function validateEnv(): { valid: boolean; missing: string[] } {
  const requiredKeys = ["DATABASE_URL", "NEXTAUTH_SECRET", "OPENROUTER_API_KEY"];
  const missing = requiredKeys.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`缺少必需的环境变量: ${missing.join(", ")}`);
  }

  return { valid: missing.length === 0, missing };
}
