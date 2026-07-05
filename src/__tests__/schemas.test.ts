import { describe, expect, it } from "vitest";
import {
  API_INPUT_LIMITS,
  ATTACHMENT_LIMITS,
  CHAT_CONFIG_LIMITS,
  PLUGIN_EXECUTION_LIMITS,
} from "../config/limits";
import {
  ChatRequestSchema,
  DocumentParseSchema,
  EncryptedSecretEnvelopeSchema,
  MessageSchema,
  SearchRequestSchema,
  SimpleGenerateRequestSchema,
  ToolExecutionSchema,
  VoiceSynthesizeRequestSchema,
  VoiceTranscribeRequestSchema,
} from "../lib/api/schemas";

const encryptedSecret = {
  v: 1,
  kid: "test-key",
  alg: "RSA-OAEP-256+A256GCM",
  iv: "iv",
  wrappedKey: "wrapped",
  ciphertext: "ciphertext",
  context: "provider:Gemini",
} as const;

describe("api schemas", () => {
  it("accepts encrypted BYOK envelopes", () => {
    expect(EncryptedSecretEnvelopeSchema.parse(encryptedSecret)).toEqual(
      encryptedSecret,
    );
  });

  it("rejects non-base64url BYOK envelope fields", () => {
    expect(() =>
      EncryptedSecretEnvelopeSchema.parse({
        ...encryptedSecret,
        ciphertext: "not+base64/url=",
      }),
    ).toThrow();
  });

  it("rejects plaintext provider API keys", () => {
    expect(() =>
      ChatRequestSchema.parse({
        provider: { type: "Gemini", apiKey: "test" },
        modelName: "gemini-test",
        history: [],
        newMessage: "hello",
      }),
    ).toThrow(/encrypted BYOK secret/i);
  });

  it("rejects unknown high-risk request fields", () => {
    expect(() =>
      ChatRequestSchema.parse({
        provider: { type: "Gemini", apiKeySecret: encryptedSecret },
        modelName: "gemini-test",
        history: [],
        newMessage: "hello",
        unexpected: true,
      }),
    ).toThrow();

    expect(() =>
      SearchRequestSchema.parse({
        provider: "tavily",
        query: "hello",
        config: {
          apiKeySecret: { ...encryptedSecret, context: "search:tavily" },
          extra: "field",
        },
      }),
    ).toThrow();
  });

  it("fills legacy tool call status defaults", () => {
    const message = MessageSchema.parse({
      role: "model",
      content: "",
      toolCalls: [
        {
          id: "call_1",
          name: "lookup",
          args: { q: "neo" },
          result: { ok: true },
        },
      ],
    });

    expect(message.id).toBe("");
    expect(message.timestamp).toBe(0);
    expect(message.toolCalls?.[0]?.status).toBe("success");
  });

  it("accepts skill invocation descriptions in chat history", () => {
    expect(() =>
      ChatRequestSchema.parse({
        provider: { type: "Gemini", apiKeySecret: encryptedSecret },
        modelName: "gemini-test",
        history: [
          {
            role: "model",
            content: "Translated text",
            skillInvocations: [
              {
                id: "translation-localization",
                title: "Translation & Localization",
                description:
                  "Translate and localize text between Chinese and English.",
                category: "writing",
                mode: "manual",
              },
            ],
          },
        ],
        newMessage: "regenerate",
      }),
    ).not.toThrow();
  });

  it("rejects native search in the external search route schema", () => {
    expect(() =>
      SearchRequestSchema.parse({
        provider: "google",
        query: "hello",
      }),
    ).toThrow();
  });

  it("rejects chat requests with too much attachment payload", () => {
    const firstPayload = "a".repeat(ATTACHMENT_LIMITS.maxTotalBase64Chars / 2);
    const secondPayload = "b".repeat(
      ATTACHMENT_LIMITS.maxTotalBase64Chars / 2 + 1,
    );

    expect(() =>
      ChatRequestSchema.parse({
        provider: { type: "Gemini", apiKeySecret: encryptedSecret },
        modelName: "gemini-test",
        history: [],
        newMessage: "hello",
        attachments: [
          {
            id: "att_1",
            mimeType: "text/plain",
            fileName: "large-a.txt",
            data: firstPayload,
          },
          {
            id: "att_2",
            mimeType: "text/plain",
            fileName: "large-b.txt",
            data: secondPayload,
          },
        ],
      }),
    ).toThrow(/Attachment payload is too large/i);
  });

  it("rejects chat requests with oversized model or text fields", () => {
    const baseRequest = {
      provider: { type: "Gemini", apiKeySecret: encryptedSecret },
      modelName: "gemini-test",
      history: [],
      newMessage: "hello",
    };

    expect(() =>
      ChatRequestSchema.parse({
        ...baseRequest,
        modelName: "m".repeat(API_INPUT_LIMITS.maxModelNameChars + 1),
      }),
    ).toThrow();

    expect(() =>
      ChatRequestSchema.parse({
        ...baseRequest,
        newMessage: "x".repeat(API_INPUT_LIMITS.maxChatTextChars + 1),
      }),
    ).toThrow();

    expect(() =>
      ChatRequestSchema.parse({
        ...baseRequest,
        systemInstruction: "x".repeat(
          API_INPUT_LIMITS.maxSystemInstructionChars + 1,
        ),
      }),
    ).toThrow();
  });

  it("rejects chat requests with out-of-range temperature", () => {
    const baseRequest = {
      provider: { type: "Gemini", apiKeySecret: encryptedSecret },
      modelName: "gemini-test",
      history: [],
      newMessage: "hello",
    };

    expect(() =>
      ChatRequestSchema.parse({
        ...baseRequest,
        config: { temperature: CHAT_CONFIG_LIMITS.maxTemperature + 1 },
      }),
    ).toThrow();

    expect(() =>
      ChatRequestSchema.parse({
        ...baseRequest,
        config: { temperature: CHAT_CONFIG_LIMITS.maxTemperature },
      }),
    ).not.toThrow();
  });

  it("rejects simple generation requests with oversized model or prompt fields", () => {
    const baseRequest = {
      provider: { type: "Gemini", apiKeySecret: encryptedSecret },
      modelName: "gemini-test",
      prompt: "hello",
    };

    expect(() =>
      SimpleGenerateRequestSchema.parse({
        ...baseRequest,
        modelName: "m".repeat(API_INPUT_LIMITS.maxModelNameChars + 1),
      }),
    ).toThrow();

    expect(() =>
      SimpleGenerateRequestSchema.parse({
        ...baseRequest,
        prompt: "x".repeat(API_INPUT_LIMITS.maxSimplePromptChars + 1),
      }),
    ).toThrow();
  });

  it("rejects unsafe remote attachment URLs on chat requests", () => {
    expect(() =>
      ChatRequestSchema.parse({
        provider: { type: "Gemini", apiKeySecret: encryptedSecret },
        modelName: "gemini-test",
        history: [],
        newMessage: "read this",
        attachments: [
          {
            id: "att_1",
            mimeType: "text/plain",
            fileName: "local.txt",
            url: "http://127.0.0.1:8080/local.txt",
          },
        ],
      }),
    ).toThrow(/Only HTTPS|Localhost|Private network/i);
  });

  it("requires a voice ID for ElevenLabs speech synthesis requests", () => {
    expect(() =>
      VoiceSynthesizeRequestSchema.parse({
        provider: "elevenlabs",
        apiKeySecret: { ...encryptedSecret, context: "voice:elevenlabs" },
        text: "hello",
      }),
    ).toThrow(/voice ID is required/i);

    expect(() =>
      VoiceSynthesizeRequestSchema.parse({
        provider: "browser",
        text: "hello",
      }),
    ).not.toThrow();
  });

  it("accepts Mimo speech provider requests", () => {
    expect(() =>
      VoiceSynthesizeRequestSchema.parse({
        provider: "mimo",
        apiKeySecret: { ...encryptedSecret, context: "voice:mimo" },
        text: "hello",
        voiceId: "mimo_default",
      }),
    ).not.toThrow();

    expect(() =>
      VoiceTranscribeRequestSchema.parse({
        provider: "mimo",
        apiKeySecret: { ...encryptedSecret, context: "voice:mimo" },
        modelId: "mimo-v2.5-asr",
        language: "auto",
      }),
    ).not.toThrow();
  });

  it("rejects plaintext document parse API keys", () => {
    expect(() =>
      DocumentParseSchema.parse({
        file: new File(["hello"], "doc.txt", { type: "text/plain" }),
        apiKeySecret: { ...encryptedSecret, context: "docs:llama-parse" },
        apiKey: "test",
      }),
    ).toThrow(/encrypted BYOK secret/i);
  });

  it("rejects plaintext voice transcription API keys", () => {
    expect(() =>
      VoiceTranscribeRequestSchema.parse({
        provider: "elevenlabs",
        apiKeySecret: { ...encryptedSecret, context: "voice:elevenlabs" },
        apiKey: "test",
      }),
    ).toThrow(/encrypted BYOK secret/i);
  });

  it("rejects oversized plugin execution arguments", () => {
    expect(() =>
      ToolExecutionSchema.parse({
        plugin: {
          id: "test-plugin",
          baseUrl: "https://api.example.com",
          functions: [
            {
              name: "lookup",
              path: "/lookup",
              method: "GET",
              parameters: { type: "object", properties: {} },
            },
          ],
        },
        functionDef: {
          name: "lookup",
          path: "/lookup",
          method: "GET",
          parameters: { type: "object", properties: {} },
        },
        args: {
          q: "x".repeat(PLUGIN_EXECUTION_LIMITS.maxArgsJsonChars + 1),
        },
      }),
    ).toThrow(/too large/i);
  });

  it("rejects plaintext plugin auth values", () => {
    expect(() =>
      ToolExecutionSchema.parse({
        plugin: {
          id: "test-plugin",
          baseUrl: "https://api.example.com",
          auth: { type: "apiKey" },
          functions: [
            {
              name: "lookup",
              path: "/lookup",
              method: "GET",
              parameters: { type: "object", properties: {} },
            },
          ],
        },
        functionDef: {
          name: "lookup",
          path: "/lookup",
          method: "GET",
          parameters: { type: "object", properties: {} },
        },
        args: { q: "neo" },
        authConfig: { type: "apiKey", value: "secret" },
      }),
    ).toThrow(/encrypted BYOK secret/i);
  });
});
