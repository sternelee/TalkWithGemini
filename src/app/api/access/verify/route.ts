import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_ATTEMPTS_COOKIE,
  ACCESS_ERROR_CODES,
  ACCESS_LOCKOUT_SECONDS,
  ACCESS_LOCKOUT_MS,
  ACCESS_MAX_ATTEMPTS,
  ACCESS_SESSION_COOKIE,
  createAccessSessionCookieValue,
  getAccessAttemptState,
  isAccessLocked,
  isAccessPasswordEnabled,
  isValidAccessPassword,
  recordAccessPasswordFailure,
} from "@/lib/security/accessControl";
import {
  getRateLimitBucket,
  incrementRateLimitBucket,
  resetRateLimitBucket,
} from "../../../../lib/security/rateLimitStore";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function getServerFailureKey(request: NextRequest): string {
  return `access-password:${getClientIp(request)}`;
}

export async function POST(request: NextRequest) {
  if (!isAccessPasswordEnabled()) {
    return noStore(NextResponse.json({ ok: true }));
  }

  const serverFailureKey = getServerFailureKey(request);
  const serverFailures = await getRateLimitBucket(serverFailureKey);
  if (serverFailures && serverFailures.count >= ACCESS_MAX_ATTEMPTS) {
    return noStore(
      NextResponse.json(
        {
          error: "Access is temporarily locked",
          code: ACCESS_ERROR_CODES.locked,
          lockedUntil: serverFailures.resetAt,
        },
        { status: 423 },
      ),
    );
  }

  const attemptsCookie = request.cookies.get(ACCESS_ATTEMPTS_COOKIE)?.value;
  const attemptState = await getAccessAttemptState(attemptsCookie);

  if (isAccessLocked(attemptState)) {
    return noStore(
      NextResponse.json(
        {
          error: "Access is temporarily locked",
          code: ACCESS_ERROR_CODES.locked,
          lockedUntil: attemptState.lockedUntil,
        },
        { status: 423 },
      ),
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password.trim() : "";
  } catch {
    password = "";
  }

  if (password && (await isValidAccessPassword(password))) {
    await resetRateLimitBucket(serverFailureKey);
    const response = noStore(NextResponse.json({ ok: true }));
    response.cookies.set(
      ACCESS_SESSION_COOKIE,
      await createAccessSessionCookieValue(),
      cookieOptions,
    );
    response.cookies.set(ACCESS_ATTEMPTS_COOKIE, "", {
      ...cookieOptions,
      maxAge: 0,
    });
    return response;
  }

  const failure = await recordAccessPasswordFailure(attemptsCookie);
  const serverFailure = await incrementRateLimitBucket(
    serverFailureKey,
    ACCESS_LOCKOUT_MS,
  );
  const serverLocked = serverFailure.count >= ACCESS_MAX_ATTEMPTS;
  const lockedUntil =
    failure.lockedUntil || (serverLocked ? serverFailure.resetAt : undefined);
  const status = lockedUntil ? 423 : 401;
  const response = noStore(
    NextResponse.json(
      {
        error: lockedUntil
          ? "Access is temporarily locked"
          : "Invalid access password",
        code: lockedUntil
          ? ACCESS_ERROR_CODES.locked
          : ACCESS_ERROR_CODES.invalid,
        remainingAttempts: Math.min(
          failure.remainingAttempts,
          Math.max(0, ACCESS_MAX_ATTEMPTS - serverFailure.count),
        ),
        ...(lockedUntil ? { lockedUntil } : {}),
      },
      { status },
    ),
  );

  response.cookies.set(ACCESS_ATTEMPTS_COOKIE, failure.cookieValue, {
    ...cookieOptions,
    maxAge: ACCESS_LOCKOUT_SECONDS,
  });
  return response;
}
