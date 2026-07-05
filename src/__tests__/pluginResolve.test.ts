import { describe, expect, it } from "vitest";
import {
  getPluginFunctionNameCollisions,
  getEnabledPluginFunctions,
  resolvePluginFunction,
} from "../lib/plugin/resolve";
import type { Plugin } from "../types";

const makePlugin = (id: string, functionNames: string[]): Plugin => ({
  id,
  title: id,
  description: "",
  logoUrl: "",
  manifestUrl: "",
  baseUrl: "https://example.com",
  functions: functionNames.map((name) => ({
    name,
    description: name,
    path: `/${name}`,
    method: "GET",
    parameters: { type: "object", properties: {} },
  })),
  auth: { type: "none" },
});

describe("plugin function resolution", () => {
  it("resolves functions only from allowed active plugins", () => {
    const inactive = makePlugin("inactive", ["search"]);
    const active = makePlugin("active", ["search"]);

    expect(
      resolvePluginFunction([inactive, active], "search", ["active"])?.plugin
        .id,
    ).toBe("active");
  });

  it("does not resolve functions from inactive plugins", () => {
    const inactive = makePlugin("inactive", ["search"]);

    expect(
      resolvePluginFunction([inactive], "search", ["another-plugin"]),
    ).toBeNull();
  });

  it("applies enabled and disabled function filters", () => {
    const plugin = makePlugin("tools", ["search", "lookup", "delete"]);

    expect(
      getEnabledPluginFunctions(plugin, { enabledFunctions: ["lookup"] }).map(
        (fn) => fn.name,
      ),
    ).toEqual(["lookup"]);

    expect(
      getEnabledPluginFunctions(plugin, { disabledFunctions: ["delete"] }).map(
        (fn) => fn.name,
      ),
    ).toEqual(["search", "lookup"]);
  });

  it("reports duplicate enabled function names across active plugins", () => {
    const first = makePlugin("first", ["search", "lookup"]);
    const second = makePlugin("second", ["search"]);
    const inactive = makePlugin("inactive", ["lookup"]);

    expect(
      getPluginFunctionNameCollisions(
        [first, second, inactive],
        ["first", "second"],
        {},
      ),
    ).toEqual([
      {
        name: "search",
        pluginIds: ["first", "second"],
      },
    ]);
  });
});
