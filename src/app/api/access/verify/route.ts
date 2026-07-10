import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "../../../../lib/api/middleware";
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
import { getRateLimitClientIp } from "../../../../lib/security/requestGuards";

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

function getServerFailureKey(request: NextRequest): string | null {
  const clientIp = getRateLimitClientIp(request);
  return clientIp === "unknown" ? null : `access-password:${clientIp}`;
}

export async function POST(request: NextRequest) {
  if (!isAccessPasswordEnabled()) {
    return noStore(NextResponse.json({ ok: true }));
  }

  const serverFailureKey = getServerFailureKey(request);
  const serverFailures = serverFailureKey
    ? await getRateLimitBucket(serverFailureKey)
    : null;
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
    const body = (await readJsonRequestBody(request)) as { password?: unknown };
    password = typeof body.password === "string" ? body.password.trim() : "";
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      return noStore(createApiErrorResponse(error));
    }
    password = "";
  }

  if (password && (await isValidAccessPassword(password))) {
    if (serverFailureKey) await resetRateLimitBucket(serverFailureKey);
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
  const serverFailure = serverFailureKey
    ? await incrementRateLimitBucket(serverFailureKey, ACCESS_LOCKOUT_MS)
    : null;
  const serverLocked = Boolean(
    serverFailure && serverFailure.count >= ACCESS_MAX_ATTEMPTS,
  );
  const lockedUntil =
    failure.lockedUntil || (serverLocked ? serverFailure?.resetAt : undefined);
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
          serverFailure
            ? Math.max(0, ACCESS_MAX_ATTEMPTS - serverFailure.count)
            : failure.remainingAttempts,
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
