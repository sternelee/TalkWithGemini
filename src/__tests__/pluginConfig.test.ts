import { describe, expect, it } from "vitest";
import { PLUGIN_CONFIG_LIMITS } from "../config/limits";
import {
  normalizeActivePluginIds,
  normalizePluginConfig,
  normalizePluginConfigs,
  normalizePluginIdRefs,
} from "../lib/plugin/config";
import type { Plugin } from "../types";

const makePlugin = (
  id: string,
  functionNames: string[],
  auth: Plugin["auth"] = { type: "none" },
): Plugin => ({
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
  auth,
});

describe("plugin config normalization", () => {
  it("deduplicates and filters generic plugin id references", () => {
    expect(
      normalizePluginIdRefs(
        [" public ", "public", "", 123, "missing", "auth"],
        ["public", "auth"],
      ),
    ).toEqual(["public", "auth"]);
  });

  it("caps auth fields and normalizes auth metadata", () => {
    const config = normalizePluginConfig({
      baseUrl: " https://api.example.com/v1 ",
      auth: {
        type: "unknown",
        value: ` ${"k".repeat(PLUGIN_CONFIG_LIMITS.maxAuthValueChars + 10)}`,
        key: ` ${"h".repeat(PLUGIN_CONFIG_LIMITS.maxAuthKeyChars + 10)}`,
        addTo: "body",
      },
    });

    expect(config.baseUrl).toBe("https://api.example.com/v1");
    expect(config.auth?.type).toBe("bearer");
    expect(config.auth?.addTo).toBe("header");
    expect(config.auth?.value).toHaveLength(
      PLUGIN_CONFIG_LIMITS.maxAuthValueChars,
    );
    expect(config.auth?.key).toHaveLength(PLUGIN_CONFIG_LIMITS.maxAuthKeyChars);
  });

  it("drops unsafe plugin endpoint overrides", () => {
    expect(
      normalizePluginConfig({
        baseUrl: "http://localhost:3000/v1",
      }).baseUrl,
    ).toBeUndefined();
  });

  it("normalizes plugin model defaults", () => {
    const model = ` gpt-image-${"x".repeat(
      PLUGIN_CONFIG_LIMITS.maxModelNameChars + 10,
    )} `;
    const config = normalizePluginConfig({ model });

    expect(config.model).toHaveLength(PLUGIN_CONFIG_LIMITS.maxModelNameChars);
    expect(config.model?.startsWith("gpt-image-")).toBe(true);
    expect(normalizePluginConfig({ model: "" }).model).toBeUndefined();
  });

  it("deduplicates function refs and keeps only declared plugin functions", () => {
    const config = normalizePluginConfig(
      {
        enabledFunctions: [" search ", "search", "unknown"],
        disabledFunctions: ["delete", "unknown", "delete"],
      },
      ["search", "delete"],
    );

    expect(config.enabledFunctions).toEqual(["search"]);
    expect(config.disabledFunctions).toEqual(["delete"]);
  });

  it("normalizes plugin config maps and active plugin ids", () => {
    const publicPlugin = makePlugin("public", ["search"]);
    const authPlugin = makePlugin("auth", ["lookup"], { type: "bearer" });
    const plugins = [publicPlugin, authPlugin];

    const configs = normalizePluginConfigs(
      {
        public: { disabledFunctions: ["search", "bad"] },
        auth: { auth: { type: "bearer", value: "" } },
        unknown: { auth: { type: "bearer", value: "secret" } },
      },
      plugins,
    );

    expect(configs).toEqual({
      public: { disabledFunctions: ["search"] },
      auth: {
        disabledFunctions: [],
        auth: { type: "bearer", addTo: "header" },
      },
    });

    expect(
      normalizeActivePluginIds(
        ["public", "public", "auth", "missing"],
        plugins,
        configs,
      ),
    ).toEqual(["public"]);

    const configsWithAuth = normalizePluginConfigs(
      { auth: { auth: { type: "bearer", value: "secret" } } },
      plugins,
    );
    expect(
      normalizeActivePluginIds(["auth"], plugins, configsWithAuth),
    ).toEqual(["auth"]);
  });

  it("allows optional-auth plugins to remain active without a saved secret", () => {
    const optionalPlugin = makePlugin("optional", ["read"], {
      type: "bearer",
      required: false,
    } as Plugin["auth"]);
    const requiredPlugin = makePlugin("required", ["generate"], {
      type: "bearer",
      required: true,
    } as Plugin["auth"]);
    const plugins = [optionalPlugin, requiredPlugin];
    const configs = normalizePluginConfigs({}, plugins);

    expect(
      normalizeActivePluginIds(["optional", "required"], plugins, configs),
    ).toEqual(["optional"]);
  });
});
