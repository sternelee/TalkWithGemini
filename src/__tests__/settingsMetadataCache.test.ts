import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/api", async () => vi.importActual("../config/api"));
vi.mock("@/config/defaults", async () => vi.importActual("../config/defaults"));
vi.mock("@/config/limits", async () => vi.importActual("../config/limits"));
vi.mock("@/config/plugins", async () => vi.importActual("../config/plugins"));
vi.mock("@/lib/defaultConfig/shared", async () =>
  vi.importActual("../lib/defaultConfig/shared"),
);
vi.mock("@/lib/market/agents", async () =>
  vi.importActual("../lib/market/agents"),
);
vi.mock("@/lib/plugin/config", async () =>
  vi.importActual("../lib/plugin/config"),
);
vi.mock("@/lib/providers/config", async () =>
  vi.importActual("../lib/providers/config"),
);
vi.mock("@/lib/providers/metadata", async () =>
  vi.importActual("../lib/providers/metadata"),
);
vi.mock("@/lib/providers/providerTypes", async () =>
  vi.importActual("../lib/providers/providerTypes"),
);
vi.mock("@/lib/security/localSecrets", async () =>
  vi.importActual("../lib/security/localSecrets"),
);
vi.mock("@/lib/security/localSecretResolvers", async () =>
  vi.importActual("../lib/security/localSecretResolvers"),
);
vi.mock("@/lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);
vi.mock("@/lib/utils/defaultModels", async () =>
  vi.importActual("../lib/utils/defaultModels"),
);
vi.mock("@/types", async () => vi.importActual("../types"));

describe("model metadata cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 0, 1));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses cached model metadata for 72 hours", async () => {
    const { useSettingsStore } = await import("../store/core/settingsStore");
    const now = Date.now();
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    useSettingsStore.setState({
      modelMetadata: {
        "gpt-test": { id: "gpt-test", name: "Cached GPT" },
      },
      modelMetadataTimestamp: now - 72 * 60 * 60 * 1000 + 1,
    } as any);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network should not be used"));

    await useSettingsStore.getState().fetchModelMetadata();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().modelMetadata["gpt-test"]?.name).toBe(
      "Cached GPT",
    );
  });

  it("force refreshes model metadata even inside the cache window", async () => {
    const { useSettingsStore } = await import("../store/core/settingsStore");
    const now = Date.now();
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    useSettingsStore.setState({
      modelMetadata: {
        "gpt-test": { id: "gpt-test", name: "Cached GPT" },
      },
      modelMetadataTimestamp: now,
    } as any);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          openai: {
            id: "openai",
            models: {
              "gpt-fresh": { id: "gpt-fresh", name: "Fresh GPT" },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await useSettingsStore.getState().fetchModelMetadata(true);

    expect(useSettingsStore.getState().modelMetadata).toMatchObject({
      "gpt-fresh": { id: "gpt-fresh", name: "Fresh GPT" },
    });
    expect(useSettingsStore.getState().modelMetadataTimestamp).toBe(now);
  });
});
