import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Track select calls to return different results for errorBook vs questions ----
let selectResults: unknown[][] = [];
let selectCallIndex = 0;

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            const result = selectResults[selectCallIndex] ?? [];
            selectCallIndex++;
            return Promise.resolve(result);
          },
        }),
      }),
    }),
    update: () => ({
      set: (data: unknown) => {
        updateSetData = data;
        return {
          where: () => Promise.resolve(),
        };
      },
    }),
  },
}));

let updateSetData: unknown = null;

// ---- Mock withAuth ----
vi.mock("@/lib/auth/guard", () => ({
  withAuth: (handler: Function) => {
    return async (req: NextRequest) => {
      const user = {
        id: "user-001",
        name: "Test User",
        email: "test@example.com",
        role: "employee",
        tenantId: "tenant-001",
      };
      return handler(req, { user });
    };
  },
}));

// ---- Import after mocks ----
import { POST } from "@/app/api/review/update/route";

// ---- Helpers ----
function makeRequest(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/review/update", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

const VALID_ERROR_BOOK_ID = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const VALID_QUESTION_ID = "b2c3d4e5-f6a7-4890-abcd-ef1234567891";

function makeErrorBookEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_ERROR_BOOK_ID,
    userId: "user-001",
    questionId: VALID_QUESTION_ID,
    knowledgeId: "33333333-3333-3333-3333-333333333333",
    nextReviewAt: new Date(),
    reviewCount: 0,
    correctStreak: 0,
    isResolved: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_QUESTION_ID,
    correctAnswer: "A",
    explanations: "This is the explanation",
    ...overrides,
  };
}

describe("POST /api/review/update", () => {
  beforeEach(() => {
    selectCallIndex = 0;
    selectResults = [];
    updateSetData = null;
  });

  it("正确答案 → streak 递增, nextReviewAt 设为 24h 后", async () => {
    selectResults = [
      [makeErrorBookEntry({ correctStreak: 0 })],
      [makeQuestion({ correctAnswer: "A" })],
    ];

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const req = makeRequest({
      errorBookId: VALID_ERROR_BOOK_ID,
      selectedAnswer: "A",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.isCorrect).toBe(true);
    expect(json.data.correctStreak).toBe(1);
    expect(json.data.resolved).toBe(false);

    // Verify db.update set data
    const setData = updateSetData as Record<string, unknown>;
    expect(setData.correctStreak).toBe(1);
    expect(setData.reviewCount).toBe(1);

    // Verify nextReviewAt is 24h from now
    const expectedTime = now + 24 * 3600000;
    expect((setData.nextReviewAt as Date).getTime()).toBe(expectedTime);

    vi.spyOn(Date, "now").mockRestore();
  });

  it("错误答案 → streak 重置为 0，nextReviewAt 设为 24h 后", async () => {
    selectResults = [
      [makeErrorBookEntry({ correctStreak: 2, reviewCount: 3 })],
      [makeQuestion({ correctAnswer: "A" })],
    ];

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const req = makeRequest({
      errorBookId: VALID_ERROR_BOOK_ID,
      selectedAnswer: "B",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.isCorrect).toBe(false);
    expect(json.data.correctStreak).toBe(0);
    expect(json.data.resolved).toBe(false);

    const setData = updateSetData as Record<string, unknown>;
    expect(setData.correctStreak).toBe(0);
    expect(setData.reviewCount).toBe(4);

    const expectedTime = now + 24 * 3600000;
    expect((setData.nextReviewAt as Date).getTime()).toBe(expectedTime);

    vi.spyOn(Date, "now").mockRestore();
  });

  it("连续3次正确(streak从2到3) → isResolved: true", async () => {
    selectResults = [
      [makeErrorBookEntry({ correctStreak: 2, reviewCount: 5 })],
      [makeQuestion({ correctAnswer: "C" })],
    ];

    const req = makeRequest({
      errorBookId: VALID_ERROR_BOOK_ID,
      selectedAnswer: "C",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.isCorrect).toBe(true);
    expect(json.data.correctStreak).toBe(3);
    expect(json.data.resolved).toBe(true);
    expect(json.data.message).toContain("移出");

    const setData = updateSetData as Record<string, unknown>;
    expect(setData.correctStreak).toBe(3);
    expect(setData.reviewCount).toBe(6);
    expect(setData.isResolved).toBe(true);
  });

  it("间隔验证: streak=1 → 72h (streak从1到2)", async () => {
    selectResults = [
      [makeErrorBookEntry({ correctStreak: 1 })],
      [makeQuestion({ correctAnswer: "D" })],
    ];

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const req = makeRequest({
      errorBookId: VALID_ERROR_BOOK_ID,
      selectedAnswer: "D",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.isCorrect).toBe(true);
    expect(json.data.correctStreak).toBe(2);
    expect(json.data.resolved).toBe(false);

    // streak=2, interval index = newStreak-1 = 1 → 72h
    const setData = updateSetData as Record<string, unknown>;
    const expectedTime = now + 72 * 3600000;
    expect((setData.nextReviewAt as Date).getTime()).toBe(expectedTime);

    vi.spyOn(Date, "now").mockRestore();
  });

  it("错题条目不存在 → 返回 NOT_FOUND", async () => {
    // First select returns empty (no error book entry found)
    selectResults = [[]];

    const req = makeRequest({
      errorBookId: VALID_ERROR_BOOK_ID,
      selectedAnswer: "A",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(json.error).toContain("不存在");
    expect(res.status).toBe(404);
  });

  it("无效参数 → 返回 VALIDATION_ERROR", async () => {
    const req = makeRequest({
      errorBookId: "not-a-uuid",
      selectedAnswer: "E",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(res.status).toBe(400);
  });
});
