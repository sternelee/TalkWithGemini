export type DeploymentMode = "local" | "hosted";

export interface OutboundPolicyProfile {
  mode: DeploymentMode;
  allowLocalNetworkProxy: boolean;
}

const DEPLOYMENT_MODE_ENV = "DEPLOYMENT_MODE";
const ALLOW_LOCAL_NETWORK_PROXY_ENV = "ALLOW_LOCAL_NETWORK_PROXY";

function getEnvValue(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env[name];
}

export function getDeploymentMode(): DeploymentMode {
  const raw = getEnvValue(DEPLOYMENT_MODE_ENV)?.trim().toLowerCase();
  return raw === "hosted" ? "hosted" : "local";
}

function getExplicitLocalNetworkProxySetting(): boolean | undefined {
  const raw = getEnvValue(ALLOW_LOCAL_NETWORK_PROXY_ENV)?.trim().toLowerCase();
  if (!raw) return undefined;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return undefined;
}

export function getOutboundPolicyProfile(): OutboundPolicyProfile {
  const mode = getDeploymentMode();
  const explicit = getExplicitLocalNetworkProxySetting();

  return {
    mode,
    allowLocalNetworkProxy: explicit ?? mode === "local",
  };
}

export function isHostedProxyRestricted(): boolean {
  const profile = getOutboundPolicyProfile();
  return profile.mode === "hosted" && !profile.allowLocalNetworkProxy;
}
