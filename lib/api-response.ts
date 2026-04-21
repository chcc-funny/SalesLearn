import { NextResponse } from "next/server";

/**
 * 统一 API 响应格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: ErrorCode;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

/**
 * 错误码常量
 */
export enum ErrorCode {
  // 通用错误 (1xxx)
  UNKNOWN = 1000,
  VALIDATION_ERROR = 1001,
  NOT_FOUND = 1002,
  ALREADY_EXISTS = 1003,

  // 认证错误 (2xxx)
  UNAUTHORIZED = 2001,
  FORBIDDEN = 2002,
  TOKEN_EXPIRED = 2003,
  INVALID_CREDENTIALS = 2004,

  // 业务错误 (3xxx)
  KNOWLEDGE_NOT_PUBLISHED = 3001,
  QUIZ_ALREADY_ANSWERED = 3002,
  FEYNMAN_TOO_SHORT = 3003,
  FILE_TOO_LARGE = 3004,

  // 外部服务错误 (4xxx)
  LLM_ERROR = 4001,
  ASR_ERROR = 4002,
  STORAGE_ERROR = 4003,
  DATABASE_ERROR = 4004,

  // 限流错误 (5xxx)
  RATE_LIMITED = 5001,
}

/**
 * 错误码对应的 HTTP 状态码
 */
const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  [ErrorCode.UNKNOWN]: 500,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.ALREADY_EXISTS]: 409,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.KNOWLEDGE_NOT_PUBLISHED]: 400,
  [ErrorCode.QUIZ_ALREADY_ANSWERED]: 400,
  [ErrorCode.FEYNMAN_TOO_SHORT]: 400,
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.LLM_ERROR]: 502,
  [ErrorCode.ASR_ERROR]: 502,
  [ErrorCode.STORAGE_ERROR]: 502,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.RATE_LIMITED]: 429,
};

/**
 * 成功响应
 */
export function successResponse<T>(
  data: T,
  meta?: ApiResponse["meta"]
): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, meta });
}

/**
 * 错误响应
 */
export function errorResponse(
  message: string,
  code: ErrorCode = ErrorCode.UNKNOWN
): NextResponse<ApiResponse> {
  const status = ERROR_STATUS_MAP[code] ?? 500;
  return NextResponse.json({ success: false, error: message, code }, { status });
}

/**
 * 分页成功响应
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): NextResponse<ApiResponse<T[]>> {
  return NextResponse.json({
    success: true,
    data,
    meta: { total, page, limit },
  });
}
