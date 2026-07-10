import {
  BYOK_ALG,
  BYOK_CONTEXTS,
  ByokPublicKeyResponse,
  EncryptedSecretEnvelope,
} from "./shared";
import { arrayBufferToBytes, bytesToBase64Url } from "./encoding";
import type { ModelProvider, SearchServiceConfig } from "../../types";
import { SERVER_DEFAULT_PROVIDER_ID } from "../defaultConfig/shared";
import {
  resolveProviderApiKey,
  resolveSearchApiKey,
} from "../security/localSecretResolvers";
import { ResponseTimeoutError } from "../errors";

let publicKeyPromise: Promise<ByokPublicKeyResponse> | null = null;
let publicKeyController: AbortController | null = null;
const PUBLIC_KEY_TIMEOUT_MS = 30_000;

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted", "AbortError");
  }
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

async function waitForCaller<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  if (!signal) return promise;

  let abortListener: (() => void) | null = null;
  const aborted = new Promise<never>((_, reject) => {
    abortListener = () => reject(createAbortError());
    signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePublicKeyResponse(value: unknown): ByokPublicKeyResponse {
  if (!isRecord(value) || !isRecord(value.publicKeyJwk)) {
    throw new Error("Invalid BYOK public key response");
  }

  const { kid, alg, publicKeyJwk } = value;
  if (typeof kid !== "string" || !kid.trim() || alg !== BYOK_ALG) {
    throw new Error("Invalid BYOK public key metadata");
  }

  if (
    publicKeyJwk.kty !== "RSA" ||
    typeof publicKeyJwk.n !== "string" ||
    typeof publicKeyJwk.e !== "string"
  ) {
    throw new Error("Invalid BYOK RSA public key");
  }

  return {
    kid,
    alg: BYOK_ALG,
    publicKeyJwk: publicKeyJwk as JsonWebKey,
  };
}

async function getPublicKey(
  signal?: AbortSignal,
): Promise<ByokPublicKeyResponse> {
  if (!publicKeyPromise) {
    const controller = new AbortController();
    publicKeyController = controller;
    const timeout = setTimeout(
      () =>
        controller.abort(
          new ResponseTimeoutError(
            PUBLIC_KEY_TIMEOUT_MS,
            "BYOK public key request",
          ),
        ),
      PUBLIC_KEY_TIMEOUT_MS,
    );
    const request = fetch("/api/byok/public-key", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load BYOK public key");
        }
        return parsePublicKeyResponse(await response.json());
      })
      .catch((error) => {
        if (publicKeyPromise === request) {
          publicKeyPromise = null;
        }
        if (controller.signal.reason instanceof ResponseTimeoutError) {
          throw controller.signal.reason;
        }
        throw error;
      })
      .finally(() => {
        clearTimeout(timeout);
        if (publicKeyController === controller) {
          publicKeyController = null;
        }
      });
    publicKeyPromise = request;
  }

  return waitForCaller(publicKeyPromise, signal);
}

export function clearByokPublicKeyCache(): void {
  publicKeyController?.abort();
  publicKeyController = null;
  publicKeyPromise = null;
}

async function isByokAuthError(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;

  let data: any = null;
  try {
    data = await response.clone().json();
  } catch {
    return false;
  }

  const message =
    typeof data?.error === "string"
      ? data.error
      : typeof data?.message === "string"
        ? data.message
        : "";

  return (
    data?.code === "AUTH_ERROR" && /BYOK|decrypt|key id|context/i.test(message)
  );
}

export async function fetchWithByokRetry(
  requestFactory: () => Promise<Response>,
): Promise<Response> {
  const response = await requestFactory();
  if (!(await isByokAuthError(response))) {
    return response;
  }

  clearByokPublicKeyCache();
  return requestFactory();
}

export async function encryptSecret(
  secret: string | undefined,
  context: string,
  signal?: AbortSignal,
): Promise<EncryptedSecretEnvelope | undefined> {
  const trimmed = secret?.trim();
  if (!trimmed) return undefined;

  const { kid, alg, publicKeyJwk } = await getPublicKey(signal);
  throwIfAborted(signal);
  if (alg !== BYOK_ALG) {
    throw new Error("Unsupported BYOK public key algorithm");
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"],
  );
  throwIfAborted(signal);
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  throwIfAborted(signal);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(context),
    },
    aesKey,
    encoder.encode(trimmed),
  );
  throwIfAborted(signal);
  const wrappedKey = await crypto.subtle.wrapKey("raw", aesKey, publicKey, {
    name: "RSA-OAEP",
  });
  throwIfAborted(signal);

  return {
    v: 1,
    kid,
    alg: BYOK_ALG,
    iv: bytesToBase64Url(iv),
    wrappedKey: bytesToBase64Url(arrayBufferToBytes(wrappedKey)),
    ciphertext: bytesToBase64Url(arrayBufferToBytes(ciphertext)),
    context,
  };
}

export async function buildProviderRuntimeConfig(
  provider: ModelProvider,
  signal?: AbortSignal,
) {
  if (provider.isServerDefault || provider.id === SERVER_DEFAULT_PROVIDER_ID) {
    return {
      type: provider.type,
      name: provider.name,
      source: "server-default" as const,
    };
  }

  const apiKey = await resolveProviderApiKey(provider);
  return {
    type: provider.type,
    baseUrl: provider.baseUrl,
    name: provider.name,
    apiKeySecret: await encryptSecret(
      apiKey,
      BYOK_CONTEXTS.provider(provider.type),
      signal,
    ),
  };
}

export async function buildSearchRuntimeConfig(
  provider: string,
  config: SearchServiceConfig,
  signal?: AbortSignal,
) {
  if (provider === "default") {
    return {
      useDefault: true,
    };
  }

  const apiKey = await resolveSearchApiKey(provider, config);
  return {
    baseUrl: config.baseUrl,
    apiKeySecret: await encryptSecret(
      apiKey,
      BYOK_CONTEXTS.search(provider),
      signal,
    ),
  };
}
