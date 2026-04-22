import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { checkRateLimit, getRateLimitType } from "@/lib/rate-limit";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 静态资源和首页放行
  if (
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // API 限流（对所有 API 路由生效，包括公开路由）
  if (pathname.startsWith("/api/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const type = getRateLimitType(pathname);
    const { allowed, retryAfter } = checkRateLimit(`${ip}:${type}`, type);

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "请求过于频繁，请稍后再试", code: 5001 },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
  }

  // 公开路径直接放行
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // 未登录重定向到登录页
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 主管端路由：仅 manager 可访问
  if (pathname.startsWith("/admin") && token.role !== "manager") {
    return NextResponse.redirect(new URL("/learn", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
