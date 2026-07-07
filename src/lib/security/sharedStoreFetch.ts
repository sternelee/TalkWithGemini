import { getSafeUrlPolicy } from "./urlPolicy";

const SHARED_STORE_TIMEOUT_MS = 10_000;
const SHARED_STORE_MAX_RESPONSE_BYTES = 1024 * 1024;

export async function safeFetchSharedStoreJson<T = unknown>(
  input: string | URL,
  init: RequestInit = {},
): Promise<{ response: Response; data: T; url: string }> {
  const { safeFetchJson } = await import("./safeFetch");
  return safeFetchJson<T>(
    input,
    {
      ...init,
      cache: "no-store",
    },
    {
      policy: getSafeUrlPolicy("sharedStore"),
      timeoutMs: SHARED_STORE_TIMEOUT_MS,
      maxResponseBytes: SHARED_STORE_MAX_RESPONSE_BYTES,
    },
  );
}
