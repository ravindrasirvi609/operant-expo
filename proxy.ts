import { NextResponse, type NextRequest } from "next/server";

import {
  VISITOR_COOKIE_NAME,
  newVisitorId,
  readVisitorIdFrom,
  visitorCookieOptions,
} from "@/lib/booking/visitor";
import { checkRateLimit } from "@/lib/http/rate-limit";

// The embeddable booking widget is served under /embed/* and is intentionally framable by
// third-party sites. Every other path stays locked down. Keep this the single place that decides
// "can this page be put in an iframe" for the whole app.
const EMBEDDABLE_PATH_PREFIX = "/embed/";

// Paths where a visitor may start a reservation. The identity cookie is minted here rather than in
// a route handler because the public exhibition page is a Server Component, which can read cookies
// but cannot set them — so by the time the map renders, the id has to already exist.
const VISITOR_PATH_PATTERN = /^\/(exhibitions|embed)\/|^\/api\/public\//;

const RATE_LIMITED_PATHS: Array<{ test: (pathname: string) => boolean; limit: number; windowMs: number }> = [
  { test: (path) => path === "/api/auth/login" || path === "/api/auth/register", limit: 10, windowMs: 60_000 },
  { test: (path) => /^\/api\/public\/exhibitions\/[^/]+\/stalls\/[^/]+\/hold$/.test(path), limit: 20, windowMs: 60_000 },
  { test: (path) => /^\/api\/public\/exhibitions\/[^/]+\/bookings$/.test(path), limit: 10, windowMs: 60_000 },
];

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Builds the response, minting a visitor id for reservation paths when the browser has none.
 *
 * The id is appended to the *forwarded request* cookies so the very render that mints it already
 * sees it, rather than treating this visitor as anonymous until their next navigation. It is
 * deliberately not put on a response header: per the Next.js guidance, upstream request headers stay
 * server-side, while response headers are visible to the client — and this value is a credential.
 */
function buildResponse(request: NextRequest, pathname: string) {
  const needsVisitorId = VISITOR_PATH_PATTERN.test(pathname) && !readVisitorIdFrom(request.cookies);
  if (!needsVisitorId) return NextResponse.next();

  const visitorId = newVisitorId();
  const requestHeaders = new Headers(request.headers);
  const existingCookies = requestHeaders.get("cookie");
  requestHeaders.set(
    "cookie",
    existingCookies
      ? `${existingCookies}; ${VISITOR_COOKIE_NAME}=${visitorId}`
      : `${VISITOR_COOKIE_NAME}=${visitorId}`,
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(VISITOR_COOKIE_NAME, visitorId, {
    ...visitorCookieOptions,
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const rule = RATE_LIMITED_PATHS.find((entry) => entry.test(pathname));
  if (rule) {
    const { allowed } = checkRateLimit(`${clientKey(request)}:${pathname}`, rule);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly.", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }
  }

  const response = buildResponse(request, pathname);
  const isEmbeddable = pathname.startsWith(EMBEDDABLE_PATH_PREFIX);

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (isEmbeddable) {
    response.headers.set("Content-Security-Policy", "frame-ancestors *");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  }

  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
