import { describe, expect, it } from "vitest";
import {
  ELEVENLABS_TTS_MODELS,
  getAvailableProviderModel,
  isElevenLabsSTTModel,
  isElevenLabsTTSModel,
  isProviderModelAvailable,
} from "../lib/utils/voiceModels";
import type { ModelProvider } from "../types";

const providers: ModelProvider[] = [
  {
    id: "VOICE",
    name: "Voice Provider",
    type: "OpenAI",
    baseUrl: "https://api.example.com",
    apiKey: "key",
    enabled: true,
    models: ["audio:model:latest", "tts-1"],
    modelsList: ["audio:model:latest", "tts-1"],
  },
  {
    id: "OFF",
    name: "Disabled Provider",
    type: "OpenAI",
    baseUrl: "https://api.example.com",
    apiKey: "key",
    enabled: false,
    models: ["whisper-1"],
    modelsList: ["whisper-1"],
  },
];

describe("voice model utilities", () => {
  it("resolves enabled provider models while preserving colons in model ids", () => {
    expect(
      getAvailableProviderModel("VOICE:audio:model:latest", providers),
    ).toMatchObject({
      modelId: "audio:model:latest",
      provider: { id: "VOICE" },
    });
  });

  it("rejects missing, disabled, and unprefixed provider model references", () => {
    expect(isProviderModelAvailable("VOICE:missing", providers)).toBe(false);
    expect(isProviderModelAvailable("OFF:whisper-1", providers)).toBe(false);
    expect(isProviderModelAvailable("whisper-1", providers)).toBe(false);
  });

  it("recognizes only supported ElevenLabs STT model ids", () => {
    expect(isElevenLabsSTTModel("scribe_v2")).toBe(true);
    expect(isElevenLabsSTTModel("scribe_v1")).toBe(true);
    expect(isElevenLabsSTTModel("VOICE:scribe_v2")).toBe(false);
  });

  it("recognizes supported ElevenLabs TTS model ids", () => {
    expect(ELEVENLABS_TTS_MODELS).toEqual([
      "eleven_flash_v2_5",
      "eleven_multilingual_v2",
      "eleven_flash_v2",
      "eleven_v3",
    ]);
    expect(isElevenLabsTTSModel("eleven_flash_v2_5")).toBe(true);
    expect(isElevenLabsTTSModel("eleven_multilingual_v2")).toBe(true);
    expect(isElevenLabsTTSModel("scribe_v2")).toBe(false);
    expect(isElevenLabsTTSModel("VOICE:eleven_flash_v2_5")).toBe(false);
  });
});
