import { describe, it, expect } from "vitest";

/**
 * Harness Batch11 smoke test：
 *  - unit32: app/(admin)/admin/scripts/page.tsx 列表页
 *  - unit33: app/(admin)/admin/scripts/new/page.tsx 新建页
 *           + app/(admin)/admin/scripts/[id]/edit/page.tsx 编辑页
 *
 * 验证 page 模块可被 import 且默认导出为 function 组件。
 * 页面层主要走 e2e 验证，这里仅做 import smoke test。
 */

import ScriptsListPage from "@/app/(admin)/admin/scripts/page";
import ScriptNewPage from "@/app/(admin)/admin/scripts/new/page";
import ScriptEditPage from "@/app/(admin)/admin/scripts/[id]/edit/page";

describe("Harness Batch11 - admin scripts page smoke", () => {
  it("admin/scripts/page.tsx default export is a function", () => {
    expect(typeof ScriptsListPage).toBe("function");
  });

  it("admin/scripts/new/page.tsx default export is a function", () => {
    expect(typeof ScriptNewPage).toBe("function");
  });

  it("admin/scripts/[id]/edit/page.tsx default export is a function", () => {
    expect(typeof ScriptEditPage).toBe("function");
  });
});
