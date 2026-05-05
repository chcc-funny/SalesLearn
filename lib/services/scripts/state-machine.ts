import type { ScriptStatus } from "@/lib/db/schema/scripts";

/**
 * 话术状态机：合法转移矩阵
 *
 * 状态闭环（与 docs/features/scripts/README.md §3.1 对齐）：
 *   draft ─提交─► pending_review ─批准─► published ─下架─► archived
 *                       │
 *                       └─拒绝─► rejected ─修改─► draft
 *
 * 设计原则：
 *  - 显式枚举每个 from→to 合法转移，避免散落 if/else
 *  - 自跳转一律非法（同状态写入应在调用方过滤，避免无意义事件）
 *  - archived 是终态，不可回流
 *  - 纯函数实现，无副作用，不接 DB
 */
const TRANSITION_MATRIX: Readonly<Record<ScriptStatus, readonly ScriptStatus[]>> = {
  draft: ["pending_review"],
  pending_review: ["published", "rejected"],
  published: ["archived"],
  rejected: ["draft"],
  archived: [],
} as const;

/**
 * 判断 from → to 是否为合法状态转移。
 * 自跳转一律返回 false。
 */
export function canTransition(from: ScriptStatus, to: ScriptStatus): boolean {
  if (from === to) return false;
  return TRANSITION_MATRIX[from].includes(to);
}

/**
 * 返回某个状态允许的下一个状态列表（数组副本，调用方修改不影响内部矩阵）。
 */
export function getAllowedNextStates(from: ScriptStatus): ScriptStatus[] {
  return [...TRANSITION_MATRIX[from]];
}

/**
 * 状态转移业务错误：在 service 层硬拦截非法跳转时抛出。
 * API 层捕获后返回 400 + VALIDATION_ERROR。
 */
export class ScriptStateTransitionError extends Error {
  readonly from: ScriptStatus;
  readonly to: ScriptStatus;

  constructor(from: ScriptStatus, to: ScriptStatus) {
    super(`非法的话术状态转移：${from} → ${to}`);
    this.name = "ScriptStateTransitionError";
    this.from = from;
    this.to = to;
    // 维持 V8 prototype 链，保证 instanceof 正确
    Object.setPrototypeOf(this, ScriptStateTransitionError.prototype);
  }
}

/**
 * 断言状态转移合法，否则抛 ScriptStateTransitionError。
 */
export function assertTransition(from: ScriptStatus, to: ScriptStatus): void {
  if (!canTransition(from, to)) {
    throw new ScriptStateTransitionError(from, to);
  }
}
