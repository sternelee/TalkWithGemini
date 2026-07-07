"use client";
import React, { useEffect, useMemo } from "react";
import { Mic, Volume2, MessageSquare, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSettingsStore } from "@/store/core/settingsStore";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { CustomSelect, SecretInput, SimpleSwitch } from "./SettingsUI";
import {
  STTProvider,
  TTSProvider,
  VoiceLanguage,
  ElevenLabsVoiceID,
  MimoVoiceID,
  VoiceSettings as VoiceSettingsConfig,
} from "@/types";
import {
  DEFAULT_ELEVENLABS_TTS_MODEL,
  ELEVENLABS_STT_MODELS,
  ELEVENLABS_TTS_MODELS,
  isElevenLabsSTTModel,
  isElevenLabsTTSModel,
} from "@/lib/utils/voiceModels";
import {
  encryptLocalSecret,
  LOCAL_SECRET_CONTEXTS,
} from "@/lib/security/localSecrets";
import { supportsModality } from "@/lib/utils/model";

const MIMO_STT_MODEL = "mimo-v2.5-asr";
const MIMO_API_KEY_URL = "https://platform.xiaomimimo.com/";
const ELEVENLABS_API_KEY_URL = "https://elevenlabs.io/app/settings/api-keys";

const VoiceSettings = () => {
  const t = useTranslations("Voice");
  const {
    voice,
    updateVoiceSettings,
    modelMetadata,
    customModelMetadata,
    serverConfig,
  } = useSettingsStore();
  const { providers } = useCoreSettingsStore();

  const { audioInputModels, audioOutputModels } = useMemo(() => {
    const inputModels: { id: string; name: string }[] = [];
    const outputModels: { id: string; name: string }[] = [];

    providers
      .filter((p) => p.enabled)
      .forEach((p) => {
        p.models.forEach((mId) => {
          const meta = customModelMetadata[mId] || modelMetadata[mId];
          const name = meta?.name || mId;
          const fullId = `${p.id}:${mId}`;
          const displayName = `${name} (${p.name})`;

          if (
            supportsModality(meta, "audio", "input") ||
            mId.toLowerCase().includes("whisper")
          ) {
            inputModels.push({ id: fullId, name: displayName });
          }

          if (
            supportsModality(meta, "audio", "output") ||
            mId.toLowerCase().includes("tts")
          ) {
            outputModels.push({ id: fullId, name: displayName });
          }
        });
      });

    return {
      audioInputModels: inputModels,
      audioOutputModels: outputModels,
    };
  }, [customModelMetadata, modelMetadata, providers]);

  useEffect(() => {
    const updates: Partial<VoiceSettingsConfig> = {};

    if (
      voice.sttProvider === "default" &&
      serverConfig &&
      !serverConfig.voice.defaultSttAvailable
    ) {
      updates.sttProvider = "browser";
      updates.sttModel = "";
    } else if (voice.sttProvider === "model") {
      const fallbackModel = audioInputModels[0]?.id;
      const selectedModelAvailable = audioInputModels.some(
        (model) => model.id === voice.sttModel,
      );

      if (!selectedModelAvailable) {
        updates.sttModel = fallbackModel || "";
        if (!fallbackModel) {
          updates.sttProvider = "browser";
        }
      }
    } else if (
      voice.sttProvider === "elevenlabs" &&
      !isElevenLabsSTTModel(voice.sttModel)
    ) {
      updates.sttModel = "scribe_v2";
    } else if (
      voice.sttProvider === "mimo" &&
      voice.sttModel !== MIMO_STT_MODEL
    ) {
      updates.sttModel = MIMO_STT_MODEL;
    }

    if (voice.ttsProvider === "model") {
      const fallbackModel = audioOutputModels[0]?.id;
      const selectedModelAvailable = audioOutputModels.some(
        (model) => model.id === voice.ttsModel,
      );

      if (!selectedModelAvailable) {
        updates.ttsModel = fallbackModel || "";
        if (!fallbackModel) {
          updates.ttsProvider = "browser";
        }
      }
    } else if (
      voice.ttsProvider === "default" &&
      serverConfig &&
      !serverConfig.voice.defaultTtsAvailable
    ) {
      updates.ttsProvider = "browser";
    } else if (
      voice.ttsProvider === "elevenlabs" &&
      !isElevenLabsTTSModel(voice.ttsModel)
    ) {
      updates.ttsModel = DEFAULT_ELEVENLABS_TTS_MODEL;
    }

    if (Object.keys(updates).length > 0) {
      updateVoiceSettings(updates);
    }
  }, [
    audioInputModels,
    audioOutputModels,
    serverConfig,
    updateVoiceSettings,
    voice.sttModel,
    voice.sttProvider,
    voice.ttsModel,
    voice.ttsProvider,
  ]);

  const sttProviderOptions = [
    ...(serverConfig?.voice.defaultSttAvailable
      ? [{ value: "default", label: t("providerDefault") }]
      : []),
    { value: "browser", label: t("providerBrowser") },
    ...(audioInputModels.length > 0
      ? [{ value: "model", label: t("providerModel") }]
      : []),
    { value: "elevenlabs", label: t("providerElevenLabs") },
    { value: "mimo", label: t("providerMimo") },
  ];

  const ttsProviderOptions = [
    ...(serverConfig?.voice.defaultTtsAvailable
      ? [{ value: "default", label: t("providerDefault") }]
      : []),
    { value: "browser", label: t("providerBrowser") },
    ...(audioOutputModels.length > 0
      ? [{ value: "model", label: t("providerModel") }]
      : []),
    { value: "elevenlabs", label: t("providerElevenLabs") },
    { value: "mimo", label: t("providerMimo") },
  ];

  const languageOptions = [
    { value: "auto", label: t("langAuto") },
    { value: "en", label: t("langEnglish") },
    { value: "zh", label: t("langChinese") },
    { value: "ja", label: t("langJapanese") },
  ];

  const elevenLabsVoiceOptions = [
    { value: "bIHbv24MWmeRgasZH58o", label: t("voiceWill") },
    { value: "SAz9YHcvj6GT2YYXdXww", label: t("voiceRiver") },
  ];

  const mimoVoiceOptions: { value: MimoVoiceID; label: string }[] = [
    { value: "mimo_default", label: t("voiceMimoDefault") },
    { value: "冰糖", label: "冰糖" },
    { value: "茉莉", label: "茉莉" },
    { value: "苏打", label: "苏打" },
    { value: "白桦", label: "白桦" },
    { value: "Mia", label: "Mia" },
    { value: "Chloe", label: "Chloe" },
    { value: "Milo", label: "Milo" },
    { value: "Dean", label: "Dean" },
  ];

  const elevenLabsSTTModels = ELEVENLABS_STT_MODELS.map((modelId) => ({
    value: modelId,
    label: modelId === "scribe_v2" ? t("scribeV2") : t("scribeV1"),
  }));
  const elevenLabsTTSModels = ELEVENLABS_TTS_MODELS.map((modelId) => ({
    value: modelId,
    label: modelId,
  }));

  const currentSTTModels =
    voice.sttProvider === "elevenlabs"
      ? elevenLabsSTTModels
      : voice.sttProvider === "mimo"
        ? [{ value: MIMO_STT_MODEL, label: MIMO_STT_MODEL }]
        : audioInputModels.map((m) => ({ value: m.id, label: m.name }));

  const currentTTSModels =
    voice.ttsProvider === "elevenlabs"
      ? elevenLabsTTSModels
      : audioOutputModels.map((m) => ({
          value: m.id,
          label: m.name,
        }));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground">
        {t("title")}
      </h3>

      {/* ElevenLabs API Key */}
      <div className="space-y-2">
        <label
          htmlFor="voice-elevenlabs-api-key"
          className="text-sm font-medium text-gray-700 dark:text-foreground/85 flex justify-between"
        >
          {t("elevenLabsApiKey")}
          <a
            href={ELEVENLABS_API_KEY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
          >
            {t("getKey")} <ExternalLink size={10} aria-hidden="true" />
          </a>
        </label>
        <div className="relative">
          <SecretInput
            id="voice-elevenlabs-api-key"
            name="elevenLabsApiKey"
            placeholder={t("elevenLabsKeyPlaceholder")}
            hasSecret={Boolean(
              voice.elevenLabsApiKey || voice.elevenLabsApiKeySecret,
            )}
            onSave={async (value) =>
              updateVoiceSettings({
                elevenLabsApiKey: "",
                elevenLabsApiKeySecret: await encryptLocalSecret(
                  value,
                  LOCAL_SECRET_CONTEXTS.elevenLabsApiKey,
                ),
              })
            }
            onClear={() =>
              updateVoiceSettings({
                elevenLabsApiKey: "",
                elevenLabsApiKeySecret: undefined,
              })
            }
            inputClassName="min-w-0 flex-1 px-3 py-2 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-[background-color,border-color,box-shadow,color] font-mono text-gray-800 dark:text-foreground"
          />
        </div>
      </div>

      {/* Mimo API Key */}
      <div className="space-y-2">
        <label
          htmlFor="voice-mimo-api-key"
          className="text-sm font-medium text-gray-700 dark:text-foreground/85 flex justify-between"
        >
          {t("mimoApiKey")}
          <a
            href={MIMO_API_KEY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
          >
            {t("getKey")} <ExternalLink size={10} aria-hidden="true" />
          </a>
        </label>
        <div className="relative">
          <SecretInput
            id="voice-mimo-api-key"
            name="mimoApiKey"
            placeholder={t("mimoKeyPlaceholder")}
            hasSecret={Boolean(voice.mimoApiKey || voice.mimoApiKeySecret)}
            onSave={async (value) =>
              updateVoiceSettings({
                mimoApiKey: "",
                mimoApiKeySecret: await encryptLocalSecret(
                  value,
                  LOCAL_SECRET_CONTEXTS.mimoApiKey,
                ),
              })
            }
            onClear={() =>
              updateVoiceSettings({
                mimoApiKey: "",
                mimoApiKeySecret: undefined,
              })
            }
            inputClassName="min-w-0 flex-1 px-3 py-2 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-[background-color,border-color,box-shadow,color] font-mono text-gray-800 dark:text-foreground"
          />
        </div>
      </div>

      {/* STT Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm font-semibold text-gray-700 dark:text-foreground/85 border-b border-gray-100 dark:border-border pb-2">
          <div className="flex items-center gap-2">
            <Mic size={16} aria-hidden="true" />
            <span>{t("sttTitle")}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-normal text-gray-500 dark:text-muted-foreground">
              {t("autoTranscribe")}
            </span>
            <SimpleSwitch
              ariaLabel={t("autoTranscribeAria")}
              name="autoTranscribe"
              checked={voice.autoTranscribe}
              onChange={() =>
                updateVoiceSettings({ autoTranscribe: !voice.autoTranscribe })
              }
            />
          </div>
        </div>

        {!voice.autoTranscribe && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg flex gap-3 border border-blue-100 dark:border-blue-900/30">
            <MessageSquare
              size={18}
              className="text-blue-500 shrink-0 mt-0.5"
            />
            <div className="text-xs text-blue-700 dark:text-blue-300">
              <p className="font-semibold mb-0.5">{t("voiceNoteMode")}</p>
              <p>{t("voiceNoteModeDesc")}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
              {t("provider")}
            </label>
            <CustomSelect
              ariaLabel={t("sttProviderAria")}
              value={voice.sttProvider}
              onChange={(val) => {
                const newVal = val as STTProvider;
                const updates: Partial<VoiceSettingsConfig> = {
                  sttProvider: newVal,
                };

                if (newVal === "default") {
                  updates.sttModel = serverConfig?.voice.sttModel || "";
                } else if (newVal === "model" && audioInputModels.length > 0) {
                  if (
                    !voice.sttModel ||
                    !audioInputModels.find((m) => m.id === voice.sttModel)
                  ) {
                    updates.sttModel = audioInputModels[0].id;
                  }
                } else if (newVal === "elevenlabs") {
                  if (!isElevenLabsSTTModel(voice.sttModel)) {
                    updates.sttModel = "scribe_v2";
                  }
                } else if (newVal === "mimo") {
                  updates.sttModel = MIMO_STT_MODEL;
                }
                updateVoiceSettings(updates);
              }}
              options={sttProviderOptions}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
              {t("language")}
            </label>
            <CustomSelect
              ariaLabel={t("sttLanguageAria")}
              value={voice.sttLanguage}
              onChange={(val) =>
                updateVoiceSettings({ sttLanguage: val as VoiceLanguage })
              }
              options={languageOptions}
            />
          </div>

          {(voice.sttProvider === "model" ||
            voice.sttProvider === "elevenlabs" ||
            voice.sttProvider === "mimo") && (
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
                {t("selectModel")}
              </label>
              <CustomSelect
                ariaLabel={t("sttModelAria")}
                value={
                  voice.sttModel ||
                  (voice.sttProvider === "elevenlabs"
                    ? "scribe_v2"
                    : voice.sttProvider === "mimo"
                      ? MIMO_STT_MODEL
                      : "")
                }
                onChange={(val) => updateVoiceSettings({ sttModel: val })}
                options={currentSTTModels}
              />
            </div>
          )}
        </div>
      </div>

      {/* TTS Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-foreground/85 border-b border-gray-100 dark:border-border pb-2">
          <Volume2 size={16} aria-hidden="true" />
          <span>{t("ttsTitle")}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
              {t("provider")}
            </label>
            <CustomSelect
              ariaLabel={t("ttsProviderAria")}
              value={voice.ttsProvider}
              onChange={(val) => {
                const newVal = val as TTSProvider;
                const updates: Partial<VoiceSettingsConfig> = {
                  ttsProvider: newVal,
                };
                if (newVal === "default") {
                  if (serverConfig?.voice.defaultProvider === "mimo") {
                    updates.mimoTtsVoiceId =
                      serverConfig.voice.mimoTtsVoiceId || "mimo_default";
                  } else {
                    if (serverConfig?.voice.ttsVoiceId) {
                      updates.ttsVoiceId = serverConfig.voice.ttsVoiceId;
                    }
                    if (serverConfig?.voice.ttsModel) {
                      updates.ttsModel = serverConfig.voice.ttsModel;
                    }
                  }
                } else if (newVal === "model" && audioOutputModels.length > 0) {
                  if (
                    !voice.ttsModel ||
                    !audioOutputModels.find((m) => m.id === voice.ttsModel)
                  ) {
                    updates.ttsModel = audioOutputModels[0].id;
                  }
                } else if (newVal === "mimo") {
                  updates.mimoTtsVoiceId =
                    voice.mimoTtsVoiceId || "mimo_default";
                } else if (newVal === "elevenlabs") {
                  if (!isElevenLabsTTSModel(voice.ttsModel)) {
                    updates.ttsModel = DEFAULT_ELEVENLABS_TTS_MODEL;
                  }
                }
                updateVoiceSettings(updates);
              }}
              options={ttsProviderOptions}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
              {t("language")}
            </label>
            <CustomSelect
              ariaLabel={t("ttsLanguageAria")}
              value={voice.ttsLanguage}
              onChange={(val) =>
                updateVoiceSettings({ ttsLanguage: val as VoiceLanguage })
              }
              options={languageOptions}
            />
          </div>

          {voice.ttsProvider === "elevenlabs" && (
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
                {t("voiceElevenLabs")}
              </label>
              <CustomSelect
                ariaLabel={t("elevenLabsVoiceAria")}
                value={voice.ttsVoiceId}
                onChange={(val) =>
                  updateVoiceSettings({ ttsVoiceId: val as ElevenLabsVoiceID })
                }
                options={elevenLabsVoiceOptions}
              />
            </div>
          )}

          {voice.ttsProvider === "mimo" && (
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
                {t("voiceMimo")}
              </label>
              <CustomSelect
                ariaLabel={t("mimoVoiceAria")}
                value={voice.mimoTtsVoiceId}
                onChange={(val) =>
                  updateVoiceSettings({ mimoTtsVoiceId: val as MimoVoiceID })
                }
                options={mimoVoiceOptions}
              />
            </div>
          )}

          {(voice.ttsProvider === "model" ||
            voice.ttsProvider === "elevenlabs") && (
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">
                {t("selectModel")}
              </label>
              <CustomSelect
                ariaLabel={t("ttsModelAria")}
                value={
                  voice.ttsProvider === "elevenlabs"
                    ? isElevenLabsTTSModel(voice.ttsModel)
                      ? voice.ttsModel
                      : DEFAULT_ELEVENLABS_TTS_MODEL
                    : voice.ttsModel || ""
                }
                onChange={(val) => updateVoiceSettings({ ttsModel: val })}
                options={currentTTSModels}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceSettings;
