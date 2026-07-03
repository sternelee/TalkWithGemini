import { describe, expect, it } from "vitest";
import { parseModelString } from "../lib/utils/model";
import { resolveSelectedModel } from "../lib/utils/models";
import { SERVER_DEFAULT_PROVIDER_ID } from "../lib/defaultConfig/shared";
import type { ModelInfo } from "../services/api/chatService";

const availableModels: ModelInfo[] = [
  {
    name: "server:model-default",
    displayName: "Server Default",
    description: "Default server model",
    providerName: "Server",
  },
  {
    name: "custom:model-a",
    displayName: "Custom A",
    description: "Custom model",
    providerName: "Custom",
  },
  {
    name: "custom:model-b",
    displayName: "Custom B",
    description: "Custom model",
    providerName: "Custom",
  },
];

describe("model string utilities", () => {
  it("preserves model ids that contain colons", () => {
    expect(parseModelString("provider_1:vendor:model:latest")).toEqual({
      providerId: "provider_1",
      modelName: "vendor:model:latest",
    });
  });

  it("falls back to the full string when no valid provider prefix exists", () => {
    expect(parseModelString("gemini-2.5-flash")).toEqual({
      modelName: "gemini-2.5-flash",
    });
    expect(parseModelString(":missing-provider")).toEqual({
      modelName: ":missing-provider",
    });
    expect(parseModelString("provider-only:")).toEqual({
      modelName: "provider-only:",
    });
  });
});

describe("selected model resolution", () => {
  it("keeps the current model when it is still available", () => {
    expect(
      resolveSelectedModel(availableModels, "custom:model-b", "server"),
    ).toBe("custom:model-b");
  });

  it("uses the preferred provider model when the current model is empty", () => {
    expect(resolveSelectedModel(availableModels, "", "server")).toBe(
      "server:model-default",
    );
  });

  it("uses the preferred provider model when the current model is unavailable", () => {
    expect(
      resolveSelectedModel(availableModels, "missing:model", "server"),
    ).toBe("server:model-default");
  });

  it("prefers the server default provider after its models are available", () => {
    const models: ModelInfo[] = [
      {
        name: "custom:model-a",
        displayName: "Custom A",
        description: "Custom model",
        providerName: "Custom",
      },
      {
        name: `${SERVER_DEFAULT_PROVIDER_ID}:model-default`,
        displayName: "Server Default",
        description: "Default server model",
        providerName: "Server",
      },
    ];

    expect(resolveSelectedModel(models, "", SERVER_DEFAULT_PROVIDER_ID)).toBe(
      `${SERVER_DEFAULT_PROVIDER_ID}:model-default`,
    );
  });

  it("falls back to the first model when no preferred provider model exists", () => {
    expect(resolveSelectedModel(availableModels, "", "missing")).toBe(
      "server:model-default",
    );
  });

  it("returns an empty string when no model is available", () => {
    expect(resolveSelectedModel([], "missing:model", "server")).toBe("");
  });
});
