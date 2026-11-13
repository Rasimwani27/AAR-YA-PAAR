import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Allow Vercel dashboard to call this server's /api/* (old PC behind tunnel). */
export function middleware(request: NextRequest) {
  const allowOrigin = process.env.AAR_CORS_ORIGIN?.trim();
  if (!allowOrigin || !request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(allowOrigin),
    });
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(allowOrigin))) {
    res.headers.set(k, v);
  }
  return res;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export const config = {
  matcher: "/api/:path*",
};
