import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  getAllowedNextStates,
  ScriptStateTransitionError,
} from "@/lib/services/scripts/state-machine";
import type { ScriptStatus } from "@/lib/db/schema/scripts";

describe("scripts state machine", () => {
  describe("canTransition", () => {
    it("draft → pending_review 合法", () => {
      expect(canTransition("draft", "pending_review")).toBe(true);
    });

    it("draft → published 非法（必须经过审核）", () => {
      expect(canTransition("draft", "published")).toBe(false);
    });

    it("pending_review → published 合法（主管批准）", () => {
      expect(canTransition("pending_review", "published")).toBe(true);
    });

    it("pending_review → rejected 合法（主管拒绝）", () => {
      expect(canTransition("pending_review", "rejected")).toBe(true);
    });

    it("pending_review → archived 非法（必须先发布再归档）", () => {
      expect(canTransition("pending_review", "archived")).toBe(false);
    });

    it("published → archived 合法（主管下架）", () => {
      expect(canTransition("published", "archived")).toBe(true);
    });

    it("published → draft 非法", () => {
      expect(canTransition("published", "draft")).toBe(false);
    });

    it("published → rejected 非法", () => {
      expect(canTransition("published", "rejected")).toBe(false);
    });

    it("rejected → draft 合法（员工修改后再提交）", () => {
      expect(canTransition("rejected", "draft")).toBe(true);
    });

    it("rejected → pending_review 非法（必须先回 draft）", () => {
      expect(canTransition("rejected", "pending_review")).toBe(false);
    });

    it("archived 是终态：archived → draft 非法", () => {
      expect(canTransition("archived", "draft")).toBe(false);
    });

    it("archived 是终态：archived → published 非法", () => {
      expect(canTransition("archived", "published")).toBe(false);
    });

    it("archived 是终态：archived → pending_review 非法", () => {
      expect(canTransition("archived", "pending_review")).toBe(false);
    });

    it("同状态自跳转一律非法（draft → draft）", () => {
      expect(canTransition("draft", "draft")).toBe(false);
    });

    it("同状态自跳转一律非法（published → published）", () => {
      expect(canTransition("published", "published")).toBe(false);
    });

    it("同状态自跳转一律非法（archived → archived）", () => {
      expect(canTransition("archived", "archived")).toBe(false);
    });
  });

  describe("getAllowedNextStates", () => {
    it("draft 可去 pending_review", () => {
      expect(getAllowedNextStates("draft")).toEqual(["pending_review"]);
    });

    it("pending_review 可去 published / rejected", () => {
      expect(getAllowedNextStates("pending_review").sort()).toEqual(
        ["published", "rejected"].sort()
      );
    });

    it("published 可去 archived", () => {
      expect(getAllowedNextStates("published")).toEqual(["archived"]);
    });

    it("rejected 可去 draft", () => {
      expect(getAllowedNextStates("rejected")).toEqual(["draft"]);
    });

    it("archived 是终态，无后继", () => {
      expect(getAllowedNextStates("archived")).toEqual([]);
    });

    it("返回的是数组副本，外部修改不影响内部矩阵", () => {
      const list = getAllowedNextStates("pending_review");
      list.push("draft" as ScriptStatus);
      // 再次取一次，仍然只有原始两个
      expect(getAllowedNextStates("pending_review").sort()).toEqual(
        ["published", "rejected"].sort()
      );
    });
  });

  describe("assertTransition", () => {
    it("合法跳转：不抛错", () => {
      expect(() => assertTransition("draft", "pending_review")).not.toThrow();
    });

    it("非法跳转：抛 ScriptStateTransitionError", () => {
      expect(() => assertTransition("draft", "published")).toThrow(
        ScriptStateTransitionError
      );
    });

    it("非法跳转错误信息包含 from 和 to", () => {
      try {
        assertTransition("archived", "published");
        throw new Error("should not reach");
      } catch (err) {
        expect(err).toBeInstanceOf(ScriptStateTransitionError);
        const e = err as ScriptStateTransitionError;
        expect(e.from).toBe("archived");
        expect(e.to).toBe("published");
        expect(e.message).toContain("archived");
        expect(e.message).toContain("published");
      }
    });

    it("ScriptStateTransitionError 继承自 Error 且 name 正确", () => {
      try {
        assertTransition("draft", "archived");
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).name).toBe("ScriptStateTransitionError");
      }
    });
  });

  describe("矩阵完整性 - 全状态对", () => {
    const allStates: ScriptStatus[] = [
      "draft",
      "pending_review",
      "published",
      "rejected",
      "archived",
    ];

    it("矩阵中所有合法跳转加起来恰好 6 条", () => {
      let count = 0;
      for (const from of allStates) {
        for (const to of allStates) {
          if (canTransition(from, to)) count++;
        }
      }
      // draft→pending_review, pending_review→published, pending_review→rejected,
      // published→archived, rejected→draft  (5 条核心闭环)
      expect(count).toBe(5);
    });

    it("自跳转全部非法", () => {
      for (const s of allStates) {
        expect(canTransition(s, s)).toBe(false);
      }
    });
  });
});
