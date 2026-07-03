import { describe, expect, it } from "vitest";
import { PLUGIN_EXECUTION_LIMITS } from "../config/limits";
import {
  getPluginExecutionArgsError,
  serializePluginExecutionPayload,
} from "../lib/plugin/execution";
import type { Plugin } from "../types";

const plugin: Plugin = {
  id: "test-plugin",
  title: "Test Plugin",
  description: "",
  logoUrl: "",
  manifestUrl: "",
  baseUrl: "https://api.example.com",
  functions: [
    {
      name: "lookup",
      description: "Lookup",
      path: "/lookup",
      method: "GET",
      parameters: { type: "object", properties: {} },
    },
  ],
  auth: { type: "none" },
};

describe("plugin execution payload guard", () => {
  it("serializes valid plugin execution payloads", () => {
    const body = serializePluginExecutionPayload({
      plugin,
      functionDef: plugin.functions[0],
      args: { q: "neo" },
    });

    expect(JSON.parse(body)).toMatchObject({
      plugin: { id: "test-plugin" },
      functionDef: { name: "lookup" },
      args: { q: "neo" },
    });
  });

  it("rejects non-record and unsupported JSON arguments", () => {
    expect(getPluginExecutionArgsError("query")).toMatch(/JSON object/i);
    expect(getPluginExecutionArgsError({ when: new Date() })).toMatch(
      /JSON objects and arrays/i,
    );
    expect(getPluginExecutionArgsError({ n: Number.NaN })).toMatch(
      /non-finite/i,
    );
    expect(getPluginExecutionArgsError({ value: undefined })).toMatch(
      /cannot be serialized/i,
    );
  });

  it("rejects circular, deep, wide, and oversized arguments", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(getPluginExecutionArgsError(circular)).toMatch(/circular/i);

    let deep: Record<string, unknown> = { leaf: true };
    for (
      let index = 0;
      index < PLUGIN_EXECUTION_LIMITS.maxArgDepth + 1;
      index += 1
    ) {
      deep = { child: deep };
    }
    expect(getPluginExecutionArgsError(deep)).toMatch(/deeply nested/i);

    expect(
      getPluginExecutionArgsError({
        items: Array.from(
          { length: PLUGIN_EXECUTION_LIMITS.maxArgEntries + 1 },
          (_, index) => index,
        ),
      }),
    ).toMatch(/too many values/i);

    expect(
      getPluginExecutionArgsError({
        q: "x".repeat(PLUGIN_EXECUTION_LIMITS.maxArgsJsonChars + 1),
      }),
    ).toMatch(/too large/i);
  });
});
