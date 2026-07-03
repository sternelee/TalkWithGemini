import { describe, expect, it } from "vitest";
import {
  getPluginFunctionDefinitionError,
  getPluginFunctionPathError,
} from "../lib/plugin/manifest";

const plugin = {
  functions: [
    {
      name: "lookup",
      path: "/lookup",
      method: "GET",
    },
  ],
};

describe("plugin manifest validation", () => {
  it("accepts matching function definitions", () => {
    expect(
      getPluginFunctionDefinitionError(plugin, {
        name: "lookup",
        path: "/lookup",
        method: "get",
      }),
    ).toBeNull();
  });

  it("rejects undeclared functions", () => {
    expect(
      getPluginFunctionDefinitionError(plugin, {
        name: "admin",
        path: "/admin",
        method: "GET",
      }),
    ).toBe("Plugin function is not declared by this plugin");
  });

  it("rejects path or method changes", () => {
    expect(
      getPluginFunctionDefinitionError(plugin, {
        name: "lookup",
        path: "/admin",
        method: "GET",
      }),
    ).toBe("Plugin function definition does not match the manifest");
  });

  it("rejects absolute and protocol-relative function paths", () => {
    expect(
      getPluginFunctionPathError({ path: "https://evil.test/lookup" }),
    ).toBe("Plugin function paths must be relative");
    expect(getPluginFunctionPathError({ path: "//evil.test/lookup" })).toBe(
      "Plugin function paths must be relative",
    );
    expect(getPluginFunctionPathError({ path: "/lookup" })).toBeNull();
  });
});
