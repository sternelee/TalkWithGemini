import { describe, expect, it } from "vitest";
import { MARKET_LIMITS } from "../config/limits";
import {
  normalizeAgentDetail,
  normalizeAgentOverrides,
  normalizeLocalAgent,
  normalizeLocalAgents,
  normalizeMarketAgent,
  normalizeMarketAgents,
} from "../lib/market/agents";

describe("market agent normalization", () => {
  it("keeps valid agents with safe defaults and trimmed fields", () => {
    const agent = normalizeMarketAgent({
      identifier: "assistant-1",
      meta: {
        title: "  Helpful Assistant  ",
        description: "x".repeat(MARKET_LIMITS.maxAgentDescriptionChars + 10),
        tags: [" Search ", "search", "", "Code"],
      },
      createdAt: "2026-01-01",
      homepage: "https://example.com",
      author: " OpenAI ",
    });

    expect(agent).toMatchObject({
      identifier: "assistant-1",
      meta: {
        title: "Helpful Assistant",
        tags: ["Search", "Code"],
        category: "General",
      },
      author: "OpenAI",
    });
    expect(agent?.meta.description).toHaveLength(
      MARKET_LIMITS.maxAgentDescriptionChars,
    );
    expect(agent?.meta.avatar).toBe("\u{1F916}");
  });

  it("drops malformed agents and unsafe identifiers", () => {
    expect(normalizeMarketAgent(null)).toBeNull();
    expect(normalizeMarketAgent({ identifier: "team/agent" })).toBeNull();
    expect(normalizeMarketAgent({ identifier: "" })).toBeNull();
  });

  it("deduplicates and caps market agent lists", () => {
    const agents = Array.from(
      { length: MARKET_LIMITS.maxAgents + 10 },
      (_, index) => ({
        identifier: `agent-${index}`,
        meta: { title: `Agent ${index}` },
      }),
    );

    const normalized = normalizeMarketAgents([
      ...agents,
      { identifier: "agent-1", meta: { title: "Duplicate" } },
      { identifier: "bad/agent", meta: { title: "Bad" } },
    ]);

    expect(normalized).toHaveLength(MARKET_LIMITS.maxAgents);
    expect(normalized[1]?.meta.title).toBe("Agent 1");
    expect(normalized.some((agent) => agent.identifier === "bad/agent")).toBe(
      false,
    );
  });

  it("preserves local assistant prompts with configured size limits", () => {
    const agent = normalizeLocalAgent({
      identifier: "custom-assistant",
      isCustom: true,
      meta: {
        title: "Custom",
        description: "Custom helper",
        systemRole: "x".repeat(MARKET_LIMITS.maxAgentSystemRoleChars + 10),
        tags: Array.from(
          { length: MARKET_LIMITS.maxAgentTags + 5 },
          (_, index) => `tag-${index}`,
        ),
      },
    });

    expect(agent?.isCustom).toBe(true);
    expect(agent?.meta.systemRole).toHaveLength(
      MARKET_LIMITS.maxAgentSystemRoleChars,
    );
    expect(agent?.meta.tags).toHaveLength(MARKET_LIMITS.maxAgentTags);
  });

  it("deduplicates and caps local assistant lists", () => {
    const agents = Array.from(
      { length: MARKET_LIMITS.maxCustomAgents + 10 },
      (_, index) => ({
        identifier: `custom-${index}`,
        meta: { title: `Custom ${index}`, description: "desc" },
      }),
    );

    const normalized = normalizeLocalAgents(
      [...agents, { identifier: "custom-1", meta: { title: "Duplicate" } }],
      MARKET_LIMITS.maxCustomAgents,
    );

    expect(normalized).toHaveLength(MARKET_LIMITS.maxCustomAgents);
    expect(normalized[1]?.meta.title).toBe("Custom 1");
  });

  it("normalizes remote agent details before editing", () => {
    const detail = normalizeAgentDetail(
      {
        identifier: "different-id",
        meta: {
          title: "  Remote detail  ",
          description: "d".repeat(MARKET_LIMITS.maxAgentDescriptionChars + 10),
        },
        config: {
          systemRole: "s".repeat(MARKET_LIMITS.maxAgentSystemRoleChars + 10),
        },
      },
      "remote-agent",
    );

    expect(detail?.identifier).toBe("remote-agent");
    expect(detail?.meta.title).toBe("Remote detail");
    expect(detail?.meta.description).toHaveLength(
      MARKET_LIMITS.maxAgentDescriptionChars,
    );
    expect(detail?.config?.systemRole).toHaveLength(
      MARKET_LIMITS.maxAgentSystemRoleChars,
    );
  });

  it("normalizes persisted agent overrides by identifier key", () => {
    const normalized = normalizeAgentOverrides({
      "assistant-1": {
        identifier: "wrong-id",
        meta: {
          title: " Override ",
          systemRole: "x".repeat(MARKET_LIMITS.maxAgentSystemRoleChars + 10),
        },
      },
      "bad/id": {
        meta: { title: "Bad" },
      },
    });

    expect(Object.keys(normalized)).toEqual(["assistant-1"]);
    expect(normalized["assistant-1"]?.identifier).toBe("assistant-1");
    expect(normalized["assistant-1"]?.meta?.title).toBe("Override");
    expect(normalized["assistant-1"]?.meta?.systemRole).toHaveLength(
      MARKET_LIMITS.maxAgentSystemRoleChars,
    );
  });
});
