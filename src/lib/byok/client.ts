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

let publicKeyPromise: Promise<ByokPublicKeyResponse> | null = null;

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

async function getPublicKey(): Promise<ByokPublicKeyResponse> {
  if (!publicKeyPromise) {
    publicKeyPromise = fetch("/api/byok/public-key", {
      method: "GET",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load BYOK public key");
        }
        return parsePublicKeyResponse(await response.json());
      })
      .catch((error) => {
        publicKeyPromise = null;
        throw error;
      });
  }

  return publicKeyPromise;
}

export function clearByokPublicKeyCache(): void {
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
): Promise<EncryptedSecretEnvelope | undefined> {
  const trimmed = secret?.trim();
  if (!trimmed) return undefined;

  const { kid, alg, publicKeyJwk } = await getPublicKey();
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
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
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
  const wrappedKey = await crypto.subtle.wrapKey("raw", aesKey, publicKey, {
    name: "RSA-OAEP",
  });

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

export async function buildProviderRuntimeConfig(provider: ModelProvider) {
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
    ),
  };
}

export async function buildSearchRuntimeConfig(
  provider: string,
  config: SearchServiceConfig,
) {
  if (provider === "default") {
    return {
      useDefault: true,
    };
  }

  const apiKey = await resolveSearchApiKey(provider, config);
  return {
    baseUrl: config.baseUrl,
    apiKeySecret: await encryptSecret(apiKey, BYOK_CONTEXTS.search(provider)),
  };
}
