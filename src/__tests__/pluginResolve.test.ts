import { describe, expect, it } from "vitest";
import {
  AGNES_IMAGE_PLUGIN,
  AGNES_VIDEO_PLUGIN,
  BUILT_IN_PLUGINS,
  GEMINI_IMAGE_PLUGIN,
  OPENAI_IMAGE_PLUGIN,
  OPENAI_RESPONSES_IMAGE_PLUGIN,
} from "../config/plugins";
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

  it("keeps built-in plugin function names unique when all built-ins are active", () => {
    expect(
      getPluginFunctionNameCollisions(
        BUILT_IN_PLUGINS,
        BUILT_IN_PLUGINS.map((plugin) => plugin.id),
        {},
      ),
    ).toEqual([]);
  });

  it("registers image processing plugins with OpenAI protocols split", () => {
    expect(GEMINI_IMAGE_PLUGIN).toMatchObject({
      id: "gemini-image-generation",
      builtIn: true,
      manifestUrl: "",
      category: "Image Processing",
    });
    expect(OPENAI_IMAGE_PLUGIN).toMatchObject({
      id: "openai-image-generation",
      builtIn: true,
      manifestUrl: "",
      category: "Image Processing",
    });
    expect(OPENAI_IMAGE_PLUGIN.functions.map((fn) => fn.name)).toEqual([
      "generate_image_with_images_api",
    ]);
    expect(OPENAI_RESPONSES_IMAGE_PLUGIN).toMatchObject({
      id: "openai-responses-image-processing",
      builtIn: true,
      manifestUrl: "",
      category: "Image Processing",
    });
    expect(
      OPENAI_RESPONSES_IMAGE_PLUGIN.functions.map((fn) => fn.name),
    ).toEqual(["generate_image_with_responses"]);
  });

  it("exposes image count only on plugins that support safe count parameters", () => {
    const getProperties = (plugin: Plugin) =>
      plugin.functions[0]?.parameters?.properties as Record<string, unknown>;

    expect(getProperties(AGNES_IMAGE_PLUGIN).n).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 10,
    });
    expect(getProperties(GEMINI_IMAGE_PLUGIN).n).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 10,
    });
    expect(getProperties(OPENAI_IMAGE_PLUGIN).n).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 10,
    });
    expect(getProperties(OPENAI_RESPONSES_IMAGE_PLUGIN)).not.toHaveProperty(
      "n",
    );
  });

  it("exposes model customization on every built-in image plugin", () => {
    const getProperties = (plugin: Plugin) =>
      plugin.functions[0]?.parameters?.properties as Record<string, unknown>;

    expect(getProperties(AGNES_IMAGE_PLUGIN).model).toMatchObject({
      type: "string",
    });
    expect(getProperties(GEMINI_IMAGE_PLUGIN).model).toMatchObject({
      type: "string",
    });
    expect(getProperties(OPENAI_IMAGE_PLUGIN).model).toMatchObject({
      type: "string",
    });
    expect(getProperties(OPENAI_RESPONSES_IMAGE_PLUGIN).model).toMatchObject({
      type: "string",
    });
    expect(
      getProperties(OPENAI_RESPONSES_IMAGE_PLUGIN).image_model,
    ).toMatchObject({
      type: "string",
    });
  });

  it("exposes Agnes image editing and image-to-video parameters", () => {
    const getFunctionProperties = (plugin: Plugin, functionName: string) =>
      plugin.functions.find((fn) => fn.name === functionName)?.parameters
        ?.properties as Record<string, unknown>;

    expect(getFunctionProperties(AGNES_IMAGE_PLUGIN, "generate_image")).toEqual(
      expect.objectContaining({
        model: expect.objectContaining({ type: "string" }),
        image: expect.objectContaining({
          type: "array",
          items: { type: "string" },
        }),
      }),
    );
    expect(getFunctionProperties(AGNES_VIDEO_PLUGIN, "create_video")).toEqual(
      expect.objectContaining({
        model: expect.objectContaining({ type: "string" }),
        image: expect.objectContaining({ type: "string" }),
      }),
    );
    expect(
      getFunctionProperties(AGNES_VIDEO_PLUGIN, "get_video_result"),
    ).toEqual(
      expect.objectContaining({
        model_name: expect.objectContaining({ type: "string" }),
      }),
    );
  });
});
