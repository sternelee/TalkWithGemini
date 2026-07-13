import { NextRequest, NextResponse } from "next/server";
import { VoiceTranscribeRequestSchema } from "@/lib/api/schemas";
import {
  assertMultipartRequestContentLengthUnderLimit,
  createApiErrorResponse,
  parseJsonFormValue,
} from "@/lib/api/middleware";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import { API_INPUT_LIMITS, VOICE_LIMITS } from "@/config/limits";
import { getUploadBlobValidationError } from "@/lib/api/uploads";
import { ProviderFactory } from "@/lib/providers/base";
import { BYOK_CONTEXTS } from "@/lib/byok/shared";
import {
  decryptSecretEnvelope,
  resolveProviderRuntimeConfig,
} from "@/lib/byok/server";
import {
  isGoogleProviderType,
  isOpenAIProviderType,
} from "@/lib/providers/providerTypes";
import {
  getDefaultElevenLabsApiKey,
  getDefaultElevenLabsSttModel,
  getDefaultMimoApiKey,
  getDefaultMimoSttModel,
  getDefaultVoiceProvider,
} from "@/lib/defaultConfig/server";
import { safeServerLogError } from "@/lib/utils/safeServerLog";
import {
  getGeminiTranscriptionPrompt,
  getProviderTranscriptionLanguage,
} from "@/lib/voice/language";
import { bytesToBase64 } from "@/lib/utils/binary";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";
const MIMO_CHAT_COMPLETIONS_URL =
  "https://api.xiaomimimo.com/v1/chat/completions";
const MIMO_STT_MODEL = "mimo-v2.5-asr";

type MimoTranscriptionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function getAudioExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("aac")) return "aac";
  return "webm";
}

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

function getMimoAudioMimeType(blob: Blob): string {
  const mimeType = blob.type || "audio/wav";
  if (mimeType.includes("mpeg")) return "audio/mpeg";
  if (mimeType.includes("mp3")) return "audio/mp3";
  if (mimeType.includes("wav")) return "audio/wav";
  return mimeType;
}

async function transcribeWithMimo(
  audioBlob: Blob,
  apiKey: string,
  modelId: string | undefined,
  language: "auto" | "en" | "zh" | "ja" | undefined,
) {
  const mimeType = getMimoAudioMimeType(audioBlob);
  const audioBase64 = await blobToBase64(audioBlob);
  const { response, data } = await safeFetchJson<MimoTranscriptionResponse>(
    MIMO_CHAT_COMPLETIONS_URL,
    {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId === MIMO_STT_MODEL ? modelId : MIMO_STT_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: `data:${mimeType};base64,${audioBase64}`,
                },
              },
            ],
          },
        ],
        asr_options: {
          language: language || "auto",
        },
      }),
    },
    {
      policy: getSafeUrlPolicy("voice"),
      timeoutMs: 60_000,
      maxResponseBytes: 1024 * 1024,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: `Mimo STT Error: ${response.status}` },
      { status: response.status },
    );
  }

  return NextResponse.json({
    text: data.choices?.[0]?.message?.content || "",
  });
}

export async function POST(request: NextRequest) {
  try {
    assertMultipartRequestContentLengthUnderLimit(
      request,
      VOICE_LIMITS.maxTranscriptionAudioBytes +
        API_INPUT_LIMITS.maxMultipartOverheadBytes,
    );

    const formData = await request.formData();
    const audioBlob = formData.get("audio");
    const { provider, apiKeySecret, modelId, modelProvider, language } =
      VoiceTranscribeRequestSchema.parse({
        provider: formData.get("provider"),
        apiKeySecret: parseJsonFormValue(
          formData.get("apiKeySecret"),
          "apiKeySecret",
        ),
        apiKey: formData.get("apiKey") || undefined,
        modelId: formData.get("modelId") || undefined,
        modelProvider: parseJsonFormValue(
          formData.get("modelProvider"),
          "modelProvider",
        ),
        language: formData.get("language") || undefined,
      });

    const audioError = getUploadBlobValidationError(audioBlob, {
      label: "Audio file",
      maxBytes: VOICE_LIMITS.maxTranscriptionAudioBytes,
    });
    if (audioError) {
      return NextResponse.json(
        { error: audioError },
        {
          status: audioError.includes("too large") ? 413 : 400,
        },
      );
    }
    const validAudioBlob = audioBlob as Blob;

    const defaultVoiceProvider = getDefaultVoiceProvider();
    if (provider === "default" && !defaultVoiceProvider) {
      return NextResponse.json(
        { error: "Default speech recognition is not configured" },
        { status: 400 },
      );
    }

    if (
      provider === "mimo" ||
      (provider === "default" && defaultVoiceProvider === "mimo")
    ) {
      const defaultModel =
        provider === "default" ? getDefaultMimoSttModel() : "";
      const apiKey =
        provider === "default"
          ? getDefaultMimoApiKey()
          : apiKeySecret
            ? await decryptSecretEnvelope(apiKeySecret, BYOK_CONTEXTS.mimo)
            : "";
      if (!apiKey || (provider === "default" && !defaultModel)) {
        return NextResponse.json(
          {
            error:
              provider === "default"
                ? "Default speech recognition is not configured"
                : "Mimo API Key is missing",
          },
          { status: 400 },
        );
      }

      return transcribeWithMimo(
        validAudioBlob,
        apiKey,
        provider === "default" ? defaultModel : modelId,
        language,
      );
    }

    if (provider === "default" || provider === "elevenlabs") {
      const defaultModel =
        provider === "default" ? getDefaultElevenLabsSttModel() : "";
      const apiKey =
        provider === "default"
          ? getDefaultElevenLabsApiKey()
          : apiKeySecret
            ? await decryptSecretEnvelope(
                apiKeySecret,
                BYOK_CONTEXTS.elevenLabs,
              )
            : "";
      if (!apiKey || (provider === "default" && !defaultModel)) {
        return NextResponse.json(
          {
            error:
              provider === "default"
                ? "Default speech recognition is not configured"
                : "ElevenLabs API Key is missing",
          },
          { status: 400 },
        );
      }

      const elevenFormData = new FormData();
      elevenFormData.append("file", validAudioBlob);
      elevenFormData.append(
        "model_id",
        provider === "default" ? defaultModel : modelId || "scribe_v2",
      );

      const { response, data } = await safeFetchJson<any>(
        `${ELEVENLABS_API_URL}/speech-to-text`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
          },
          body: elevenFormData,
        },
        {
          policy: getSafeUrlPolicy("voice"),
          timeoutMs: 60_000,
          maxResponseBytes: 1024 * 1024,
        },
      );

      if (!response.ok) {
        return NextResponse.json(
          { error: `ElevenLabs STT Error: ${response.status}` },
          { status: response.status },
        );
      }

      return NextResponse.json({ text: data.text });
    }

    if (provider === "model") {
      if (!modelProvider || !modelId) {
        return NextResponse.json(
          { error: "Model provider and model ID are required" },
          { status: 400 },
        );
      }

      const resolvedProvider =
        await resolveProviderRuntimeConfig(modelProvider);
      await ProviderFactory.assertProviderOutboundAllowed(resolvedProvider);

      if (isOpenAIProviderType(resolvedProvider.type)) {
        const openai = ProviderFactory.createOpenAIClient(resolvedProvider);
        const extension = getAudioExtension(validAudioBlob.type || "");
        const file = new File([validAudioBlob], `audio.${extension}`, {
          type: validAudioBlob.type || `audio/${extension}`,
        });
        const response = await openai.audio.transcriptions.create({
          file,
          model: modelId,
          language: getProviderTranscriptionLanguage(language),
        });

        return NextResponse.json({ text: response.text || "" });
      }

      if (!isGoogleProviderType(resolvedProvider.type)) {
        return NextResponse.json(
          { error: `${resolvedProvider.type} does not support transcription` },
          { status: 400 },
        );
      }

      const gemini = ProviderFactory.createGoogleClient(resolvedProvider);
      const response = await gemini.models.generateContent({
        model: modelId,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: validAudioBlob.type || "audio/wav",
                data: await blobToBase64(validAudioBlob),
              },
            },
            { text: getGeminiTranscriptionPrompt(language) },
          ],
        },
      });

      return NextResponse.json({ text: response.text || "" });
    }

    return NextResponse.json(
      { error: "Unsupported provider" },
      { status: 400 },
    );
  } catch (error) {
    safeServerLogError("Transcription error:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return createApiErrorResponse(error, "Invalid transcription request");
    }
    return createApiErrorResponse(error, "Transcription failed");
  }
}
