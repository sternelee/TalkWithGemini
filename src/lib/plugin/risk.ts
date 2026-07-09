import type { PluginFunction, PluginFunctionRisk } from "../../types";

export function getPluginFunctionRisk(
  functionDef: Pick<PluginFunction, "method" | "risk">,
): PluginFunctionRisk {
  if (functionDef.risk) return functionDef.risk;

  const method = functionDef.method?.toUpperCase();
  if (!method) return "external";
  if (method === "GET") return "read";
  if (method === "DELETE") return "destructive";
  return "write";
}
