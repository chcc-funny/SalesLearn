import { createHmac, createHash } from "crypto";

/**
 * Tencent Cloud TC3-HMAC-SHA256 signature generator.
 * Implements the official signing algorithm for API v3.
 * @see https://cloud.tencent.com/document/api/1093/37823
 */

interface SignatureParams {
  secretId: string;
  secretKey: string;
  service: string;
  action: string;
  payload: string;
  timestamp: number;
  region?: string;
}

interface SignedHeaders {
  Authorization: string;
  "Content-Type": string;
  "X-TC-Action": string;
  "X-TC-Timestamp": string;
  "X-TC-Version": string;
  "X-TC-Region": string;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

export function generateSignedHeaders(
  params: SignatureParams
): SignedHeaders {
  const {
    secretId,
    secretKey,
    service,
    action,
    payload,
    timestamp,
    region = "ap-shanghai",
  } = params;

  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const credentialScope = `${date}/${service}/tc3_request`;

  // Step 1: Canonical request
  const httpRequestMethod = "POST";
  const canonicalUri = "/";
  const canonicalQueryString = "";
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:asr.tencentcloudapi.com\n`;
  const signedHeaders = "content-type;host";
  const hashedPayload = sha256Hex(payload);

  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");

  // Step 2: String to sign
  const algorithm = "TC3-HMAC-SHA256";
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n");

  // Step 3: Signing key
  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");

  // Step 4: Signature
  const signature = createHmac("sha256", secretSigning)
    .update(stringToSign)
    .digest("hex");

  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    "Content-Type": "application/json; charset=utf-8",
    "X-TC-Action": action,
    "X-TC-Timestamp": String(timestamp),
    "X-TC-Version": "2019-06-14",
    "X-TC-Region": region,
  };
}
