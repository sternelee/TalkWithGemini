export const ACCESS_PASSWORD_ENV = "ACCESS_PASSWORD";
export const ACCESS_SESSION_COOKIE = "neo_access_session";
export const ACCESS_ATTEMPTS_COOKIE = "neo_access_attempts";
export const ACCESS_MAX_ATTEMPTS = 3;
export const ACCESS_LOCKOUT_MS = 3 * 60 * 60 * 1000;
export const ACCESS_LOCKOUT_SECONDS = ACCESS_LOCKOUT_MS / 1000;

export const ACCESS_ERROR_CODES = {
  required: "ACCESS_PASSWORD_REQUIRED",
  invalid: "ACCESS_PASSWORD_INVALID",
  locked: "ACCESS_PASSWORD_LOCKED",
} as const;

type AccessCookiePurpose = "session" | "attempts";

export interface AccessAttemptState {
  attempts: number;
  lockedUntil?: number;
}

export interface AccessFailureResult extends AccessAttemptState {
  remainingAttempts: number;
  cookieValue: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function getAccessPassword(): string {
  return process.env[ACCESS_PASSWORD_ENV]?.trim() || "";
}

export function isAccessPasswordEnabled(): boolean {
  return Boolean(getAccessPassword());
}

async function hashAccessPassword(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return new Uint8Array(digest);
}

function timingSafeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;

  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

export async function isValidAccessPassword(
  candidate: string,
): Promise<boolean> {
  const password = getAccessPassword();
  if (!password) return false;

  return timingSafeBytesEqual(
    await hashAccessPassword(candidate.trim()),
    await hashAccessPassword(password),
  );
}

function normalizeCookieValue(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const base64 = padded.padEnd(
    padded.length + ((4 - (padded.length % 4)) % 4),
    "=",
  );
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function importSigningKey(
  purpose: AccessCookiePurpose,
  password = getAccessPassword(),
): Promise<CryptoKey | null> {
  if (!password) return null;

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`${purpose}:${password}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(
  payload: object,
  purpose: AccessCookiePurpose,
): Promise<string> {
  const key = await importSigningKey(purpose);
  if (!key) return "";

  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const payloadValue = encodeBase64Url(payloadBytes);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadValue),
  );

  return `${payloadValue}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verifyPayload<T>(
  cookieValue: string | undefined | null,
  purpose: AccessCookiePurpose,
): Promise<T | null> {
  const normalized = normalizeCookieValue(cookieValue);
  const [payloadValue, signatureValue] = normalized.split(".");

  if (!payloadValue || !signatureValue) return null;

  const key = await importSigningKey(purpose);
  if (!key) return null;

  try {
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(decodeBase64Url(signatureValue)),
      encoder.encode(payloadValue),
    );
    if (!isValid) return null;

    return JSON.parse(decoder.decode(decodeBase64Url(payloadValue))) as T;
  } catch {
    return null;
  }
}

export async function createAccessSessionCookieValue(): Promise<string> {
  return signPayload({ v: 1 }, "session");
}

export async function isValidAccessSessionCookie(
  cookieValue: string | undefined | null,
): Promise<boolean> {
  const payload = await verifyPayload<{ v?: number }>(cookieValue, "session");
  return payload?.v === 1;
}

export async function createAccessAttemptCookieValue(
  state: AccessAttemptState,
): Promise<string> {
  return signPayload({ v: 1, ...state }, "attempts");
}

export async function getAccessAttemptState(
  cookieValue: string | undefined | null,
  now = Date.now(),
): Promise<AccessAttemptState> {
  const payload = await verifyPayload<{
    v?: number;
    attempts?: number;
    lockedUntil?: number;
  }>(cookieValue, "attempts");

  if (payload?.v !== 1) return { attempts: 0 };

  const lockedUntil =
    typeof payload.lockedUntil === "number" ? payload.lockedUntil : undefined;
  if (lockedUntil !== undefined && lockedUntil <= now) {
    return { attempts: 0 };
  }

  return {
    attempts: Math.min(
      ACCESS_MAX_ATTEMPTS,
      Math.max(0, Math.trunc(payload.attempts || 0)),
    ),
    ...(lockedUntil !== undefined ? { lockedUntil } : {}),
  };
}

export function isAccessLocked(
  state: AccessAttemptState,
  now = Date.now(),
): boolean {
  return typeof state.lockedUntil === "number" && state.lockedUntil > now;
}

export async function recordAccessPasswordFailure(
  cookieValue: string | undefined | null,
  now = Date.now(),
): Promise<AccessFailureResult> {
  const current = await getAccessAttemptState(cookieValue, now);
  if (isAccessLocked(current, now)) {
    return {
      ...current,
      remainingAttempts: 0,
      cookieValue: await createAccessAttemptCookieValue(current),
    };
  }

  const attempts = Math.min(ACCESS_MAX_ATTEMPTS, current.attempts + 1);
  const lockedUntil =
    attempts >= ACCESS_MAX_ATTEMPTS ? now + ACCESS_LOCKOUT_MS : undefined;
  const next = {
    attempts,
    ...(lockedUntil !== undefined ? { lockedUntil } : {}),
  };

  return {
    ...next,
    remainingAttempts: Math.max(0, ACCESS_MAX_ATTEMPTS - attempts),
    cookieValue: await createAccessAttemptCookieValue(next),
  };
}
