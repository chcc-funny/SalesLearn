import { successResponse, errorResponse, paginatedResponse, ErrorCode } from "@/lib/api-response";

describe("successResponse", () => {
  it("returns success:true with data and status 200", async () => {
    const res = successResponse({ id: 1, name: "test" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { id: 1, name: "test" },
    });
  });

  it("includes meta when provided", async () => {
    const meta = { total: 100, page: 1, limit: 10 };
    const res = successResponse([1, 2, 3], meta);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: [1, 2, 3],
      meta,
    });
  });
});

describe("errorResponse", () => {
  const cases: Array<[string, ErrorCode, number]> = [
    ["NOT_FOUND", ErrorCode.NOT_FOUND, 404],
    ["UNAUTHORIZED", ErrorCode.UNAUTHORIZED, 401],
    ["RATE_LIMITED", ErrorCode.RATE_LIMITED, 429],
    ["VALIDATION_ERROR", ErrorCode.VALIDATION_ERROR, 400],
    ["FORBIDDEN", ErrorCode.FORBIDDEN, 403],
    ["LLM_ERROR", ErrorCode.LLM_ERROR, 502],
    ["FILE_TOO_LARGE", ErrorCode.FILE_TOO_LARGE, 413],
    ["UNKNOWN", ErrorCode.UNKNOWN, 500],
  ];

  it.each(cases)("%s maps to HTTP %i", async (_label, code, expectedStatus) => {
    const res = errorResponse("error message", code);
    expect(res.status).toBe(expectedStatus);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: "error message",
      code,
    });
  });
});

describe("paginatedResponse", () => {
  it("returns success:true with data and pagination meta", async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const res = paginatedResponse(items, 50, 2, 10);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: items,
      meta: { total: 50, page: 2, limit: 10 },
    });
  });
});
