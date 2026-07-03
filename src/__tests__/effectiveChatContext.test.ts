import { describe, expect, it } from "vitest";
import { resolveEffectiveChatContext } from "../lib/chat/effectiveChatContext";

describe("effective chat context", () => {
  it("normalizes session plugins and reports unavailable capabilities", () => {
    const context = resolveEffectiveChatContext({
      session: {
        id: "session-1",
        title: "New Chat",
        updatedAt: 1,
        model: "openai:gpt-test",
        messageCount: 0,
        systemInstruction: "Answer in project voice.",
        config: { activePlugins: ["needs-auth", "free-plugin"] },
      },
      workspace: {
        id: "workspace-1",
        name: "Workspace",
        color: "blue",
        systemPrompt: "Workspace context.",
        knowledgeCollectionIds: ["kb-1"],
        createdAt: 1,
        files: [
          { id: "file-1", fileName: "brief.txt", mimeType: "text/plain" },
        ],
      },
      systemPrompt: "Global system prompt.",
      now: new Date("2026-07-01T02:03:04.000Z"),
      selectedModel: "openai:gpt-test",
      provider: { type: "OpenAI" },
      modelMetadata: {},
      customModelMetadata: {},
      chatConfig: {
        useSearch: true,
        useReasoning: true,
        temperature: 0.7,
        useRAG: true,
      },
      search: {
        provider: "google",
        configs: {},
      },
      rag: {
        enabled: true,
        url: "",
        token: "",
        topK: 10,
        chunkSize: 512,
        llamaParseApiKey: "",
      },
      installedPlugins: [
        {
          id: "needs-auth",
          title: "Needs Auth",
          description: "",
          logoUrl: "",
          manifestUrl: "",
          functions: [],
          auth: { type: "apiKey" },
        },
        {
          id: "free-plugin",
          title: "Free Plugin",
          description: "",
          logoUrl: "",
          manifestUrl: "",
          functions: [],
          auth: { type: "none" },
        },
      ],
      pluginConfigs: {},
      activePlugins: [],
    });

    expect(context.workspaceFiles).toHaveLength(1);
    expect(context.workspaceKnowledgeCollectionIds).toEqual(["kb-1"]);
    expect(context.systemInstruction).toContain("Global system prompt.");
    expect(context.systemInstruction).toContain("Answer in project voice.");
    expect(context.systemInstruction).toContain("Workspace context.");
    expect(context.systemInstruction).toContain("Current date and time");
    expect(context.systemInstruction).toContain("2026-07-01T02:03:04.000Z");
    expect(context.activePluginIds).toEqual(["free-plugin"]);
    expect(context.capabilityStatuses.map((status) => status.code)).toEqual(
      expect.arrayContaining([
        "search_unavailable",
        "rag_unavailable",
        "plugin_auth_missing",
      ]),
    );
  });
});
