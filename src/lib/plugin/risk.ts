import type { PluginFunction, PluginFunctionRisk } from "@/types";

export function getPluginFunctionRisk(
  functionDef: Pick<PluginFunction, "method" | "risk">,
): PluginFunctionRisk {
  const method = functionDef.method?.toUpperCase();
  const methodFloor: PluginFunctionRisk = !method
    ? "external"
    : method === "GET" || method === "HEAD" || method === "OPTIONS"
      ? "read"
      : method === "DELETE"
        ? "destructive"
        : "write";
  if (!functionDef.risk) return methodFloor;

  const rank: Record<PluginFunctionRisk, number> = {
    read: 0,
    write: 1,
    external: 2,
    destructive: 3,
  };
  return rank[functionDef.risk] >= rank[methodFloor]
    ? functionDef.risk
    : methodFloor;
}
