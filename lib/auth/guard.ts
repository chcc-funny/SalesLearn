import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./options";
import { errorResponse, ErrorCode } from "@/lib/api-response";
import { type UserRole } from "@/lib/db/schema";

interface AuthenticatedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  tenantId: string;
}

type AuthenticatedHandler = (
  req: NextRequest,
  context: { user: AuthenticatedUser; params?: Record<string, string> }
) => Promise<Response>;

/**
 * API 路由鉴权守卫
 *
 * @param handler - 需要鉴权的路由处理函数
 * @param allowedRoles - 允许访问的角色列表，为空则仅要求登录
 */
export function withAuth(
  handler: AuthenticatedHandler,
  allowedRoles?: UserRole[]
) {
  return async (
    req: NextRequest,
    context?: { params?: Promise<Record<string, string>> }
  ) => {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return errorResponse("未登录，请先登录", ErrorCode.UNAUTHORIZED);
    }

    const { user } = session;

    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(user.role as UserRole)) {
        return errorResponse("权限不足，无法访问", ErrorCode.FORBIDDEN);
      }
    }

    const params = context?.params ? await context.params : undefined;

    return handler(req, { user, params });
  };
}
