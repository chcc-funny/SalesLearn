import { describe, it, expect } from "vitest";
import { generateSignedHeaders } from "@/lib/asr/tencent-signature";

const BASE_PARAMS = {
  secretId: "AKIDtest123",
  secretKey: "secretKey456",
  service: "asr",
  action: "SentenceRecognition",
  payload: '{"EngSerViceType":"16k_zh"}',
  timestamp: 1700000000, // 2023-11-14 22:13:20 UTC → date = "2023-11-14"
};

describe("generateSignedHeaders", () => {
  it("returns all required header fields", () => {
    const headers = generateSignedHeaders(BASE_PARAMS);
    expect(headers).toHaveProperty("Authorization");
    expect(headers).toHaveProperty("Content-Type");
    expect(headers).toHaveProperty("X-TC-Action");
    expect(headers).toHaveProperty("X-TC-Timestamp");
    expect(headers).toHaveProperty("X-TC-Version");
    expect(headers).toHaveProperty("X-TC-Region");
  });

  it("Authorization header starts with TC3-HMAC-SHA256 algorithm", () => {
    const headers = generateSignedHeaders(BASE_PARAMS);
    expect(headers.Authorization).toMatch(/^TC3-HMAC-SHA256 /);
  });

  it("Authorization header contains the secretId in Credential", () => {
    const headers = generateSignedHeaders(BASE_PARAMS);
    expect(headers.Authorization).toContain(`Credential=${BASE_PARAMS.secretId}/`);
  });

  it("Authorization header contains SignedHeaders=content-type;host", () => {
    const headers = generateSignedHeaders(BASE_PARAMS);
    expect(headers.Authorization).toContain("SignedHeaders=content-type;host");
  });

  it("X-TC-Action reflects the passed action", () => {
    const headers = generateSignedHeaders(BASE_PARAMS);
    expect(headers["X-TC-Action"]).toBe("SentenceRecognition");
  });

  it("X-TC-Timestamp matches the passed timestamp as a string", () => {
    const headers = generateSignedHeaders(BASE_PARAMS);
    expect(headers["X-TC-Timestamp"]).toBe(String(BASE_PARAMS.timestamp));
  });

  it("X-TC-Version is the ASR API version 2019-06-14", () => {
    const headers = generateSignedHeaders(BASE_PARAMS);
    expect(headers["X-TC-Version"]).toBe("2019-06-14");
  });

  it("defaults X-TC-Region to ap-shanghai when region not provided", () => {
    const headers = generateSignedHeaders(BASE_PARAMS);
    expect(headers["X-TC-Region"]).toBe("ap-shanghai");
  });

  it("uses custom region when provided", () => {
    const headers = generateSignedHeaders({ ...BASE_PARAMS, region: "ap-beijing" });
    expect(headers["X-TC-Region"]).toBe("ap-beijing");
  });

  it("produces deterministic output for the same inputs", () => {
    const headers1 = generateSignedHeaders(BASE_PARAMS);
    const headers2 = generateSignedHeaders(BASE_PARAMS);
    expect(headers1.Authorization).toBe(headers2.Authorization);
  });

  it("produces different signatures for different payloads", () => {
    const headers1 = generateSignedHeaders(BASE_PARAMS);
    const headers2 = generateSignedHeaders({ ...BASE_PARAMS, payload: '{"different":"payload"}' });
    expect(headers1.Authorization).not.toBe(headers2.Authorization);
  });

  it("produces different signatures for different secretKeys", () => {
    const headers1 = generateSignedHeaders(BASE_PARAMS);
    const headers2 = generateSignedHeaders({ ...BASE_PARAMS, secretKey: "differentKey" });
    expect(headers1.Authorization).not.toBe(headers2.Authorization);
  });

  it("Content-Type is application/json; charset=utf-8", () => {
    const headers = generateSignedHeaders(BASE_PARAMS);
    expect(headers["Content-Type"]).toBe("application/json; charset=utf-8");
  });

  it("credential scope includes service and date derived from timestamp", () => {
    const headers = generateSignedHeaders(BASE_PARAMS);
    // timestamp 1700000000 → 2023-11-14
    expect(headers.Authorization).toContain("2023-11-14/asr/tc3_request");
  });
});
