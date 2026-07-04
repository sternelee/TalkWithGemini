export const BYOK_ALG = "RSA-OAEP-256+A256GCM" as const;

export interface EncryptedSecretEnvelope {
  v: 1;
  kid: string;
  alg: typeof BYOK_ALG;
  iv: string;
  wrappedKey: string;
  ciphertext: string;
  context: string;
}

export interface ByokPublicKeyResponse {
  kid: string;
  alg: typeof BYOK_ALG;
  publicKeyJwk: JsonWebKey;
}

export const BYOK_CONTEXTS = {
  provider: (providerType: string) => `provider:${providerType}`,
  search: (provider: string) => `search:${provider}`,
  ragToken: "rag:token",
  mineru: "docs:mineru",
  llamaParse: "docs:llama-parse",
  elevenLabs: "voice:elevenlabs",
  mimo: "voice:mimo",
  pluginAuth: (pluginId: string) => `plugin:${pluginId}:auth`,
} as const;
