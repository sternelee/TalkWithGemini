import { describe, expect, it } from "vitest";
import { getPluginFunctionRisk } from "../lib/plugin/risk";
import type { PluginFunction } from "../types";

const fn = (
  method: NonNullable<PluginFunction["method"]>,
  risk?: PluginFunction["risk"],
): PluginFunction => ({
  name: `${method.toLowerCase()}_thing`,
  description: "",
  method,
  path: "/thing",
  parameters: { type: "object", properties: {} },
  ...(risk ? { risk } : {}),
});

describe("plugin risk classification", () => {
  it("defaults risk from HTTP method and honors manifest overrides", () => {
    expect(getPluginFunctionRisk(fn("GET"))).toBe("read");
    expect(getPluginFunctionRisk(fn("POST"))).toBe("write");
    expect(getPluginFunctionRisk(fn("PATCH"))).toBe("write");
    expect(getPluginFunctionRisk(fn("DELETE"))).toBe("destructive");
    expect(getPluginFunctionRisk(fn("GET", "external"))).toBe("external");
  });
});
