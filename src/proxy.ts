import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_ATTEMPTS_COOKIE,
  ACCESS_ERROR_CODES,
  ACCESS_SESSION_COOKIE,
  getAccessAttemptState,
  isAccessLocked,
  isAccessPasswordEnabled,
  isValidAccessSessionCookie,
} from "./lib/security/accessControl";
import { applyRequestGuards } from "./lib/security/requestGuards";

const ACCESS_VERIFY_PATH = "/api/access/verify";

function jsonError(
  status: number,
  payload: Record<string, unknown>,
): NextResponse {
  const response = NextResponse.json(
    { ...payload, statusCode: status },
    { status },
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function proxy(request: NextRequest) {
  const guardResponse = await applyRequestGuards(request);
  if (guardResponse) return guardResponse;

  if (!isAccessPasswordEnabled()) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname === ACCESS_VERIFY_PATH) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(ACCESS_SESSION_COOKIE)?.value;
  if (await isValidAccessSessionCookie(sessionCookie)) {
    return NextResponse.next();
  }

  const attemptState = await getAccessAttemptState(
    request.cookies.get(ACCESS_ATTEMPTS_COOKIE)?.value,
  );
  if (isAccessLocked(attemptState)) {
    return jsonError(423, {
      error: "Access is temporarily locked",
      code: ACCESS_ERROR_CODES.locked,
      lockedUntil: attemptState.lockedUntil,
    });
  }

  return jsonError(401, {
    error: "Access password is required",
    code: ACCESS_ERROR_CODES.required,
  });
}

export const config = {
  matcher: "/api/:path*",
};
