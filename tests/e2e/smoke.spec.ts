import { test as base, expect } from "@playwright/test";
import { test as authTest } from "./fixtures/auth";

/**
 * Smoke tests — verify the most critical paths are alive.
 * These must all pass before any deeper E2E suite runs.
 */

base.describe("未登录保护", () => {
  base("未登录访问 /learn 重定向到 /login", async ({ page }) => {
    await page.goto("/learn");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});

base.describe("登录页", () => {
  base("登录页能正常加载并显示表单", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /登录/ })).toBeVisible();
  });
});

authTest.describe("员工登录", () => {
  authTest(
    "员工登录后能进入 /learn",
    async ({ employeePage }) => {
      await expect(employeePage).toHaveURL(/\/learn/, { timeout: 10_000 });
      // Also confirm we are NOT stuck on login
      expect(employeePage.url()).not.toContain("/login");
    }
  );
});
