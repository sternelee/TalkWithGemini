import type { LocalEncryptedSecretEnvelope } from "../security/localSecrets";

export type PluginFunctionRisk = "read" | "write" | "destructive" | "external";
export type PluginSource = "builtin" | "openapi" | "mcp";
export type McpTransport = "streamable-http";

export interface PluginFunction {
  name: string;
  description: string;
  parameters: any;
  path?: string;
  method?: string;
  mcpToolName?: string;
  risk?: PluginFunctionRisk;
}

export interface PluginMcpMetadata {
  transport: McpTransport;
  serverUrl: string;
  serverName: string;
  serverVersion?: string;
  headers?: Record<string, string>;
  toolNameMap?: Record<string, string>;
}

export interface PluginAuth {
  type: "bearer" | "apiKey" | "basic" | "oauth2" | "none";
  name?: string;
  in?: "header" | "query";
  required?: boolean;
}

export interface Plugin {
  id: string;
  title: string;
  description: string;
  logoUrl: string;
  manifestUrl: string;
  externalDocsUrl?: string;
  baseUrl?: string;
  functions: PluginFunction[];
  source?: PluginSource;
  mcp?: PluginMcpMetadata;
  category?: string;
  categories?: string[];
  added?: string;
  builtIn?: boolean;
  auth?: PluginAuth;
}

export interface PluginConfig {
  enabledFunctions?: string[];
  disabledFunctions?: string[];
  baseUrl?: string;
  model?: string;
  auth?: {
    type: "bearer" | "apiKey" | "oauth2" | "none";
    value?: string;
    localValueSecret?: LocalEncryptedSecretEnvelope;
    key?: string;
    addTo?: "header" | "query";
  };
}
