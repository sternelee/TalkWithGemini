import type { ServiceHealthState } from "@/types";

export type DeploymentHealthState =
  "ok" | "info" | "unknown" | "warning" | "blocked" | "missing";

export function serviceHealthStateToDisplay(
  status?: ServiceHealthState,
): DeploymentHealthState | null {
  if (!status) return null;
  if (status === "available") return "ok";
  if (status === "local_only") return "info";
  if (status === "policy_blocked" || status === "upstream_failed") {
    return "blocked";
  }
  if (status === "missing_key" || status === "unconfigured") return "missing";
  return "warning";
}

const healthSeverity: Record<DeploymentHealthState, number> = {
  ok: 0,
  info: 1,
  unknown: 2,
  missing: 3,
  warning: 4,
  blocked: 5,
};

export function strongestDeploymentHealthState(
  states: DeploymentHealthState[],
): DeploymentHealthState {
  return states.reduce((strongest, state) =>
    healthSeverity[state] > healthSeverity[strongest] ? state : strongest,
  );
}
