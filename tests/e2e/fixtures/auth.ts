/**
 * Auth fixtures for E2E tests — storageState + API-based 登录。
 *
 * 设计：
 *   - 每个 worker 启动时，针对 employee/manager 各登录 1 次。
 *   - 登录通过 Playwright request API 直接调用 /api/auth/csrf + /api/auth/callback/credentials，
 *     比 UI 登录快得多（~500ms vs 5-30s），且不依赖 /login 页面编译。
 *   - 登录成功后将 cookies 保存到 tests/e2e/.auth/{role}.json。
 *   - 后续 test 通过 employeePage/managerPage 直接复用 storageState（不再走 UI 登录）。
 *
 * Test 用法保持不变（兼容旧的 employeePage/managerPage 接口）：
 *   import { test, expect } from './fixtures/auth'
 *   test('foo', async ({ employeePage }) => { ... })
 *   test('bar', async ({ managerPage }) => { ... })
 *
 * 测试账号（Neon dev seed）：
 *   employee: employee1@saleslearn.com / test123
 *   manager:  manager@saleslearn.com  / admin123
 */

import {
  test as base,
  type Page,
  type BrowserContext,
  request as playwrightRequest,
} from "@playwright/test";
import path from "path";
import fs from "fs";

const AUTH_DIR = path.join(__dirname, "..", ".auth");
const EMPLOYEE_AUTH_FILE = path.join(AUTH_DIR, "employee.json");
const MANAGER_AUTH_FILE = path.join(AUTH_DIR, "manager.json");

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * 通过 NextAuth API 直接登录并保存 storageState。
 * 比 UI 登录快得多，避免 dev server 编译 /login 页面的延迟。
 */
async function apiLoginAndSaveState(
  email: string,
  password: string,
  baseURL: string,
  authFile: string
): Promise<void> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  try {
    // 1. 拿 CSRF token（同时种 cookie）
    const csrfRes = await ctx.get("/api/auth/csrf");
    if (!csrfRes.ok()) {
      throw new Error(`CSRF 请求失败: ${csrfRes.status()}`);
    }
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

    // 2. 提交 credentials
    const loginRes = await ctx.post("/api/auth/callback/credentials", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      form: { email, password, csrfToken, json: "true" },
    });
    if (!loginRes.ok()) {
      throw new Error(
        `Login 请求失败: ${loginRes.status()} ${await loginRes.text()}`
      );
    }

    // 3. 验证 session 已建立
    const sessionRes = await ctx.get("/api/auth/session");
    const sessionJson = await sessionRes.json();
    if (!sessionJson?.user?.email) {
      throw new Error(
        `Session 验证失败: ${JSON.stringify(sessionJson).slice(0, 200)}`
      );
    }

    // 4. 保存 storageState
    fs.mkdirSync(path.dirname(authFile), { recursive: true });
    await ctx.storageState({ path: authFile });
  } finally {
    await ctx.dispose();
  }
}

async function ensureAuthFile(
  authFile: string,
  email: string,
  password: string,
  baseURL: string
): Promise<void> {
  if (fs.existsSync(authFile)) {
    const stat = fs.statSync(authFile);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < 30 * 60 * 1000) {
      return;
    }
  }
  await apiLoginAndSaveState(email, password, baseURL, authFile);
}

type AuthFixtures = {
  employeePage: Page;
  managerPage: Page;
  // 内部 worker-scoped 标记：保证每个 worker 只登录一次
  _employeeAuthReady: void;
  _managerAuthReady: void;
};

export const test = base.extend<AuthFixtures, AuthFixtures>({
  // worker-scoped：整个 worker 生命周期只跑一次
  // 显式 timeout=60s 给冷启动的 dev server 留出第一次 API 编译时间
  _employeeAuthReady: [
    async ({}, use) => {
      await ensureAuthFile(
        EMPLOYEE_AUTH_FILE,
        "employee1@saleslearn.com",
        "test123",
        E2E_BASE_URL
      );
      await use();
    },
    { scope: "worker", timeout: 60_000 },
  ],

  _managerAuthReady: [
    async ({}, use) => {
      await ensureAuthFile(
        MANAGER_AUTH_FILE,
        "manager@saleslearn.com",
        "admin123",
        E2E_BASE_URL
      );
      await use();
    },
    { scope: "worker", timeout: 60_000 },
  ],

  // test-scoped：每个 test 复用 storageState
  // 兼容旧 fixture 行为：fixture 返回前先 goto 默认主页（员工 → /learn，主管 → /admin）。
  employeePage: async ({ browser, _employeeAuthReady, baseURL }, use) => {
    void _employeeAuthReady;
    const context: BrowserContext = await browser.newContext({
      baseURL,
      storageState: EMPLOYEE_AUTH_FILE,
    });
    const page = await context.newPage();
    await page.goto("/learn");
    await use(page);
    await context.close();
  },

  managerPage: async ({ browser, _managerAuthReady, baseURL }, use) => {
    void _managerAuthReady;
    const context: BrowserContext = await browser.newContext({
      baseURL,
      storageState: MANAGER_AUTH_FILE,
    });
    const page = await context.newPage();
    await page.goto("/admin");
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
