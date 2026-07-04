import { afterEach, describe, expect, it } from "vitest";
import {
  clearLocalSecretKeyCache,
  decryptLocalSecret,
  deleteLocalSecretMasterKey,
  LOCAL_SECRET_CONTEXTS,
} from "../lib/security/localSecrets";
import {
  migratePluginConfigLocalSecrets,
  migrateProviderLocalSecret,
  migrateRAGLocalSecrets,
  migrateSearchLocalSecrets,
  migrateVoiceLocalSecrets,
} from "../lib/settings/localSecretMigration";
import { normalizeModelProvider } from "../lib/providers/config";
import { normalizePluginConfigs } from "../lib/plugin/config";

describe("local secret settings migration", () => {
  afterEach(async () => {
    await deleteLocalSecretMasterKey();
    clearLocalSecretKeyCache();
  });

  it("migrates provider plaintext API keys to encrypted local secrets", async () => {
    const provider = normalizeModelProvider({
      id: "LOCAL1",
      name: "Local Provider",
      type: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "provider-secret",
      enabled: true,
      models: [],
      modelsList: [],
    })!;
    const migrated = await migrateProviderLocalSecret(provider);

    expect(migrated.apiKey).toBe("");
    expect(JSON.stringify(migrated)).not.toContain("provider-secret");
    await expect(
      decryptLocalSecret(
        migrated.apiKeySecret,
        LOCAL_SECRET_CONTEXTS.providerApiKey("LOCAL1"),
      ),
    ).resolves.toBe("provider-secret");
  });

  it("migrates settings plaintext secrets to encrypted local secrets", async () => {
    const search = await migrateSearchLocalSecrets({
      provider: "tavily",
      resultsLimit: 5,
      configs: {
        tavily: { apiKey: "search-secret" },
        firecrawl: {},
        exa: {},
        bocha: {},
        searxng: { baseUrl: "http://localhost:8080" },
      },
    });
    const rag = await migrateRAGLocalSecrets({
      enabled: true,
      url: "https://rag.example",
      token: "rag-secret",
      topK: 10,
      chunkSize: 512,
      mineruApiToken: "mineru-secret",
      llamaParseApiKey: "llama-secret",
    });
    const voice = await migrateVoiceLocalSecrets({
      elevenLabsApiKey: "voice-secret",
      mimoApiKey: "mimo-secret",
    });
    const plugin = {
      id: "demo-plugin",
      title: "Demo",
      description: "Demo",
      logoUrl: "",
      manifestUrl: "",
      functions: [],
      auth: { type: "bearer" as const },
    };
    const pluginConfigs = await migratePluginConfigLocalSecrets(
      normalizePluginConfigs(
        {
          "demo-plugin": {
            disabledFunctions: [],
            auth: { type: "bearer", value: "plugin-secret" },
          },
        },
        [plugin],
      ),
    );
    const migrated = { search, rag, voice, pluginConfigs };

    expect(JSON.stringify(migrated)).not.toContain("search-secret");
    expect(JSON.stringify(migrated)).not.toContain("rag-secret");
    expect(JSON.stringify(migrated)).not.toContain("mineru-secret");
    expect(JSON.stringify(migrated)).not.toContain("llama-secret");
    expect(JSON.stringify(migrated)).not.toContain("voice-secret");
    expect(JSON.stringify(migrated)).not.toContain("mimo-secret");
    expect(JSON.stringify(migrated)).not.toContain("plugin-secret");

    await expect(
      decryptLocalSecret(
        search.configs.tavily.apiKeySecret,
        LOCAL_SECRET_CONTEXTS.searchApiKey("tavily"),
      ),
    ).resolves.toBe("search-secret");
    await expect(
      decryptLocalSecret(rag.tokenSecret, LOCAL_SECRET_CONTEXTS.ragToken),
    ).resolves.toBe("rag-secret");
    await expect(
      decryptLocalSecret(
        rag.mineruApiTokenSecret,
        LOCAL_SECRET_CONTEXTS.mineruApiToken,
      ),
    ).resolves.toBe("mineru-secret");
    await expect(
      decryptLocalSecret(
        rag.llamaParseApiKeySecret,
        LOCAL_SECRET_CONTEXTS.llamaParseApiKey,
      ),
    ).resolves.toBe("llama-secret");
    await expect(
      decryptLocalSecret(
        voice.elevenLabsApiKeySecret,
        LOCAL_SECRET_CONTEXTS.elevenLabsApiKey,
      ),
    ).resolves.toBe("voice-secret");
    await expect(
      decryptLocalSecret(
        voice.mimoApiKeySecret,
        LOCAL_SECRET_CONTEXTS.mimoApiKey,
      ),
    ).resolves.toBe("mimo-secret");
    await expect(
      decryptLocalSecret(
        pluginConfigs["demo-plugin"].auth?.localValueSecret,
        LOCAL_SECRET_CONTEXTS.pluginAuth("demo-plugin"),
      ),
    ).resolves.toBe("plugin-secret");
  });
});
