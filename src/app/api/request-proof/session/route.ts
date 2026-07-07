import { NextResponse } from "next/server";
import {
  API_PROOF_ERROR_CODES,
  API_PROOF_SESSION_COOKIE,
  API_PROOF_SESSION_TTL_MS,
  createRequestProofSession,
  getApiProofPublicStatus,
} from "@/lib/security/requestProof";

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET() {
  const status = getApiProofPublicStatus();
  const serverTime = Date.now();

  if (!status.required) {
    return noStore(
      NextResponse.json({
        enabled: false,
        serverTime,
      }),
    );
  }

  if (!status.configured) {
    return noStore(
      NextResponse.json(
        {
          error: "API request proof is not configured",
          code: API_PROOF_ERROR_CODES.notConfigured,
          statusCode: 503,
        },
        { status: 503 },
      ),
    );
  }

  const session = await createRequestProofSession(serverTime);
  const response = noStore(
    NextResponse.json({
      enabled: true,
      clientKey: session.clientKey,
      expiresAt: session.expiresAt,
      serverTime: session.serverTime,
      windowMs: session.windowMs,
    }),
  );
  response.cookies.set(API_PROOF_SESSION_COOKIE, session.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: API_PROOF_SESSION_TTL_MS / 1000,
  });
  return response;
}
