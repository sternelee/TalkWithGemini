import type { LocalEncryptedSecretEnvelope } from "../security/localSecrets";

export type STTProvider =
  "default" | "browser" | "elevenlabs" | "mimo" | "model";
export type TTSProvider =
  "default" | "browser" | "elevenlabs" | "mimo" | "model";
export type ElevenLabsVoiceID = "bIHbv24MWmeRgasZH58o" | "SAz9YHcvj6GT2YYXdXww";
export type MimoVoiceID =
  | "mimo_default"
  | "冰糖"
  | "茉莉"
  | "苏打"
  | "白桦"
  | "Mia"
  | "Chloe"
  | "Milo"
  | "Dean";
export type VoiceLanguage = "auto" | "en" | "zh";
export type ServerDefaultVoiceProvider = "elevenlabs" | "mimo";

export interface VoiceSettings {
  sttProvider: STTProvider;
  sttModel?: string;
  sttLanguage: VoiceLanguage;
  ttsProvider: TTSProvider;
  ttsModel?: string;
  ttsVoiceId: ElevenLabsVoiceID;
  mimoTtsVoiceId: MimoVoiceID;
  ttsLanguage: VoiceLanguage;
  elevenLabsApiKey: string;
  elevenLabsApiKeySecret?: LocalEncryptedSecretEnvelope;
  serverElevenLabsAvailable?: boolean;
  mimoApiKey: string;
  mimoApiKeySecret?: LocalEncryptedSecretEnvelope;
  serverMimoAvailable?: boolean;
  serverDefaultVoiceProvider?: ServerDefaultVoiceProvider;
  serverDefaultSttAvailable?: boolean;
  serverDefaultTtsAvailable?: boolean;
  serverElevenLabsTtsModel?: string;
  serverMimoSttModel?: string;
  serverMimoTtsModel?: string;
  serverMimoTtsVoiceId?: MimoVoiceID;
  autoTranscribe: boolean;
}
