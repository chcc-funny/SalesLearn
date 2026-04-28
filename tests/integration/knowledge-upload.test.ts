import { describe, it, expect, vi, beforeEach } from "vitest";
import { type NextRequest } from "next/server";

// ---- Hoisted mocks (must use vi.hoisted for all fn vars used in vi.mock factories) ----
const {
  mockManagerUser,
  mockEmployeeUser,
  mockUploadFile,
  mockProcessFileWithAI,
  mockExtractText,
} = vi.hoisted(() => {
  const mockManagerUser = {
    id: "manager-0001",
    name: "主管用户",
    email: "manager@example.com",
    role: "manager",
    tenantId: "tenant-0001",
  };

  const mockEmployeeUser = {
    id: "user-0001",
    name: "员工用户",
    email: "employee@example.com",
    role: "employee",
    tenantId: "tenant-0001",
  };

  const mockUploadFile = vi.fn();
  const mockProcessFileWithAI = vi.fn();
  const mockExtractText = vi.fn();

  return { mockManagerUser, mockEmployeeUser, mockUploadFile, mockProcessFileWithAI, mockExtractText };
});

let currentUser = mockManagerUser;

vi.mock("@/lib/storage/blob", () => ({
  uploadFile: mockUploadFile,
}));

vi.mock("@/lib/llm/split-knowledge", () => ({
  processFileWithAI: mockProcessFileWithAI,
}));

vi.mock("@/lib/file-parser", () => ({
  extractText: mockExtractText,
}));

vi.mock("@/lib/llm/openrouter", () => ({
  LLM_MODELS: {
    KIMI_K2: "moonshotai/kimi-k2",
    CLAUDE_SONNET: "anthropic/claude-sonnet-4",
    CLAUDE_HAIKU: "anthropic/claude-haiku-4-5",
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  withAuth: vi.fn((handler: Function, allowedRoles?: string[]) => {
    return async (req: NextRequest) => {
      if (allowedRoles && allowedRoles.length > 0) {
        if (!allowedRoles.includes(currentUser.role)) {
          const { errorResponse, ErrorCode } = await import("@/lib/api-response");
          return errorResponse("权限不足，无法访问", ErrorCode.FORBIDDEN);
        }
      }
      return handler(req, { user: currentUser });
    };
  }),
}));

import { POST } from "@/app/api/knowledge/upload/route";

function makeFormDataRequest(fields: {
  file?: File | null;
  category?: string;
  model?: string;
}): NextRequest {
  const formData = new FormData();
  if (fields.file !== undefined && fields.file !== null) {
    formData.append("file", fields.file);
  }
  if (fields.category) formData.append("category", fields.category);
  if (fields.model) formData.append("model", fields.model);

  return new Request("http://localhost/api/knowledge/upload", {
    method: "POST",
    body: formData,
  }) as unknown as NextRequest;
}

function makeTxtFile(content: string, name = "test.txt"): File {
  return new File([content], name, { type: "text/plain" });
}

describe("POST /api/knowledge/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockManagerUser;

    mockUploadFile.mockResolvedValue({ url: "https://blob.example.com/test.txt" });
    mockProcessFileWithAI.mockResolvedValue(["k1", "k2"]);
    mockExtractText.mockResolvedValue("这是文件内容，包含产品知识点信息。");
  });

  it("员工角色上传返回 403 FORBIDDEN", async () => {
    currentUser = mockEmployeeUser;

    const req = makeFormDataRequest({ file: makeTxtFile("content") });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it("未提供文件返回 VALIDATION_ERROR", async () => {
    const req = makeFormDataRequest({ file: null });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("文件");
  });

  it("文件内容为空返回 VALIDATION_ERROR", async () => {
    // happy-dom 中空内容文件 formData.get 返回 null，
    // 改用有内容文件 + extractText mock 返回空字符串来触发该分支
    mockExtractText.mockResolvedValueOnce("   ");

    const req = makeFormDataRequest({ file: makeTxtFile("placeholder content") });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("内容为空");
  });

  it("使用不支持的模型返回 VALIDATION_ERROR", async () => {
    const req = makeFormDataRequest({
      file: makeTxtFile("这是实际的文件内容"),
      model: "unsupported-model-xyz",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("不支持的模型");
  });

  it("主管成功上传文件，返回 SSE 流式响应 completed 事件", async () => {
    const req = makeFormDataRequest({
      file: makeTxtFile("产品知识内容", "product.txt"),
      category: "product",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    // Read the stream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }

    expect(text).toContain("completed");
    expect(text).toContain("knowledgeIds");
  });

  it("AI 切分失败时 SSE 流中返回 error 事件", async () => {
    mockProcessFileWithAI.mockRejectedValueOnce(new Error("LLM 超时"));

    const req = makeFormDataRequest({
      file: makeTxtFile("这是文件的实际内容，供测试使用"),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }

    expect(text).toContain('"type":"error"');
    expect(text).toContain("LLM 超时");
  });
});
