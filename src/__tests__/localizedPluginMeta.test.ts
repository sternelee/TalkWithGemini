import { describe, expect, it } from "vitest";
import { localizePluginMeta } from "../lib/plugin/localizedMeta";
import type { Plugin } from "../types";

describe("localized plugin metadata", () => {
  it("uses the default MCP logo when an installed MCP plugin has no logo", () => {
    const plugin: Plugin = {
      id: "custom-mcp-private-docs-123",
      source: "mcp",
      title: "Private Docs",
      description: "Custom MCP server",
      logoUrl: "",
      manifestUrl: "",
      functions: [],
      auth: { type: "none", required: false },
      mcp: {
        transport: "streamable-http",
        serverUrl: "https://mcp.example.com/mcp",
        serverName: "Private Docs",
        serverVersion: "custom",
        toolNameMap: {},
      },
    };

    expect(localizePluginMeta(plugin, (key) => key).logoUrl).toBe(
      "/mcp-logo.svg",
    );
  });
});
