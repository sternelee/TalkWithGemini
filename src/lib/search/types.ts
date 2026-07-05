import type { LocalEncryptedSecretEnvelope } from "../security/localSecrets";

export interface Source {
  title: string;
  url: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ImageSource {
  url: string;
  description?: string;
}

export type SearchProviderID =
  "default" | "google" | "tavily" | "firecrawl" | "exa" | "bocha" | "searxng";

export interface SearchServiceConfig {
  apiKey?: string;
  apiKeySecret?: LocalEncryptedSecretEnvelope;
  baseUrl?: string;
  serverAvailable?: boolean;
}
