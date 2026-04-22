export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    const result = validateEnv();
    if (!result.valid) {
      console.warn(
        `[SalesLearn] 缺少必需的环境变量: ${result.missing.join(", ")}`
      );
    }
  }
}
