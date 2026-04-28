import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/",
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    // E2E_BYPASS_RATE_LIMIT=1 让 lib/rate-limit.ts 直接放行所有请求。
    // 原因：lib/rate-limit.ts 按 IP 限流（auth=5/min），而本地 dev 所有 E2E
    // 流量共享 ip="unknown"，连续运行测试时令牌桶会被耗尽，导致登录测试 flaky。
    // 此变量仅影响测试环境，生产部署不会注入。
    env: {
      E2E_BYPASS_RATE_LIMIT: "1",
    },
  },
});
