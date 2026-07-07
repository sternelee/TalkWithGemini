export type ServiceHealthState =
  | "available"
  | "missing_key"
  | "policy_blocked"
  | "upstream_failed"
  | "local_only"
  | "unconfigured";

export type ServiceHealthServiceKey =
  | "byok"
  | "apiProof"
  | "accessPassword"
  | "hostedMode"
  | "rateLimitStore"
  | "documentParseJobStore"
  | "pluginRegistry"
  | "defaultModel"
  | "search"
  | "rag"
  | "voice";

export interface ServiceHealthItem {
  service: ServiceHealthServiceKey;
  status: ServiceHealthState;
  code: string;
  message?: string;
}

export interface ServiceHealthStatus {
  generatedAt: string;
  deploymentMode: "local" | "hosted";
  services: Record<ServiceHealthServiceKey, ServiceHealthItem>;
}
