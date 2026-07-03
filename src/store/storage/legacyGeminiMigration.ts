import localforage from "localforage";
import type {
  Attachment,
  ChatConfig,
  DefaultModels,
  LobeAgent,
  Message,
  ModelProvider,
  Session,
} from "../../types";
import { DEFAULT_CHAT_CONFIG } from "../../config/defaults";
import { normalizeProviderModelId } from "../../lib/providers/models";
import { normalizeChatConfig } from "../../lib/settings/appConfig";
import { normalizeSession } from "../../lib/chat/entities";
import { normalizeMessages } from "./migrations";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type AsyncKeyValueStorage = {
  getItem: <T = unknown>(key: string) => Promise<T | null>;
  setItem: <T = unknown>(key: string, value: T) => Promise<T>;
  removeItem: (key: string) => Promise<void>;
};

type StorageKeys = {
  CORE_SETTINGS: string;
  SETTINGS: string;
  CHAT: string;
};

type PersistedValue<T> = {
  state?: Partial<T>;
  version?: number;
};

type LegacySetting = {
  apiKey?: unknown;
  apiProxy?: unknown;
  model?: unknown;
  lang?: unknown;
  temperature?: unknown;
  maxHistoryLength?: unknown;
  sttLang?: unknown;
  ttsLang?: unknown;
};

type LegacyModel = {
  name?: unknown;
  supportedGenerationMethods?: unknown;
};

type LegacyModelState = {
  models?: unknown;
};

type LegacySummary = {
  ids?: unknown;
  content?: unknown;
};

type LegacyConversation = {
  title?: unknown;
  messages?: unknown;
  summary?: LegacySummary;
  systemInstruction?: unknown;
  chatLayout?: unknown;
};

type LegacyChatState = LegacyConversation;

type LegacyConversationState = {
  conversationList?: unknown;
  pinned?: unknown;
  currentId?: unknown;
};

type LegacyAssistantState = {
  assistants?: unknown;
};

type CoreSettingsMigrationState = {
  theme?: "light" | "dark" | "system";
  language?: string;
  providers?: ModelProvider[];
  defaultModels?: Partial<DefaultModels>;
  serverDefaultProviderEnabled?: boolean;
};

type ChatMigrationState = {
  sessions?: Session[];
  workspaces?: unknown[];
  currentSessionId?: string | null;
  selectedModel?: string;
  chatConfig?: ChatConfig;
};

type SettingsMigrationState = {
  customAgents?: LobeAgent[];
  usedAgents?: LobeAgent[];
  agentOverrides?: Record<string, Partial<LobeAgent>>;
  voice?: Record<string, unknown>;
  system?: Record<string, unknown>;
};

const LEGACY_DB_NAME = "TWG";
const LEGACY_STORE_NAME = "twgStore";
const LEGACY_SETTING_KEY = "twg-settings";
const LEGACY_CHAT_KEY = "chatStore";
const LEGACY_CONVERSATION_KEY = "conversationStore";
const LEGACY_MODEL_KEY = "modelStore";
const LEGACY_ASSISTANT_KEY = "assistantStore";
const LEGACY_MIGRATION_MARKER = "legacy-gemini-next-chat-migration";
const GEMINI_PROVIDER_ID = "GEMINI";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const MIGRATED_PERSIST_VERSION = 0;

const DEFAULT_GEMINI_MODEL_IDS = [
  "gemini-flash-latest",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
  "imagen-4.0-generate-001",
  "imagen-4.0-ultra-generate-001",
  "imagen-4.0-fast-generate-001",
  "imagen-3.0-generate-002",
];

let legacyMigrationPromise: Promise<void> | null = null;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parsePersistedValue<T>(value: unknown): PersistedValue<T> | null {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!isRecord(parsed)) return null;
  return parsed as PersistedValue<T>;
}

function getPersistedState<T>(value: unknown): Partial<T> {
  const persisted = parsePersistedValue<T>(value);
  return isRecord(persisted?.state) ? (persisted.state as Partial<T>) : {};
}

function serializePersistedState<T>(state: Partial<T>): string {
  return JSON.stringify({
    state,
    version: MIGRATED_PERSIST_VERSION,
  });
}

function getLegacyDb(): AsyncKeyValueStorage {
  return localforage.createInstance({
    name: LEGACY_DB_NAME,
    storeName: LEGACY_STORE_NAME,
    description: "Used to store data for the talk-with-gemini project",
  });
}

function readLegacySetting(localStorageRef: BrowserStorage): LegacySetting {
  const value = localStorageRef.getItem(LEGACY_SETTING_KEY);
  return getPersistedState<LegacySetting>(value) as LegacySetting;
}

function normalizeLegacyModelId(value: unknown): string {
  return normalizeProviderModelId(value) || "";
}

function normalizeFullGeminiModel(value: unknown): string {
  const model = normalizeLegacyModelId(value) || DEFAULT_GEMINI_MODEL_IDS[0];
  return `${GEMINI_PROVIDER_ID}:${model}`;
}

function collectLegacyModelIds(
  legacySetting: LegacySetting,
  legacyModelState?: LegacyModelState,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (value: unknown) => {
    const model = normalizeLegacyModelId(value);
    if (!model || seen.has(model)) return;
    seen.add(model);
    result.push(model);
  };

  add(legacySetting.model);

  if (Array.isArray(legacyModelState?.models)) {
    for (const item of legacyModelState.models) {
      if (!isRecord(item)) continue;
      const model = item as LegacyModel;
      const methods = model.supportedGenerationMethods;
      if (Array.isArray(methods) && !methods.includes("generateContent")) {
        continue;
      }
      add(model.name);
    }
  }

  DEFAULT_GEMINI_MODEL_IDS.forEach(add);
  return result;
}

export function buildLegacyGeminiProvider(
  legacySetting: LegacySetting,
  legacyModelState?: LegacyModelState,
): ModelProvider {
  const models = collectLegacyModelIds(legacySetting, legacyModelState);

  return {
    id: GEMINI_PROVIDER_ID,
    name: "Google Gemini",
    type: "Gemini",
    baseUrl: stringValue(legacySetting.apiProxy) || GEMINI_BASE_URL,
    apiKey: stringValue(legacySetting.apiKey),
    enabled: true,
    models,
    modelsList: models,
  };
}

function mergeGeminiProvider(
  providers: unknown,
  legacyProvider: ModelProvider,
): ModelProvider[] {
  const existingProviders = Array.isArray(providers)
    ? (providers.filter(isRecord) as ModelProvider[])
    : [];

  if (existingProviders.length === 0) return [legacyProvider];

  let foundGemini = false;
  const merged = existingProviders.map((provider) => {
    if (provider.id !== GEMINI_PROVIDER_ID) return provider;

    foundGemini = true;
    const models = Array.from(
      new Set([...(provider.models || []), ...legacyProvider.models]),
    );
    const modelsList = Array.from(
      new Set([
        ...(provider.modelsList || provider.models || []),
        ...(legacyProvider.modelsList || legacyProvider.models || []),
      ]),
    );

    return {
      ...provider,
      type: "Gemini" as const,
      name: provider.name || legacyProvider.name,
      baseUrl: provider.baseUrl || legacyProvider.baseUrl,
      apiKey: provider.apiKey || legacyProvider.apiKey,
      enabled: provider.enabled !== false,
      models,
      modelsList,
    };
  });

  return foundGemini ? merged : [legacyProvider, ...merged];
}

function buildDefaultModels(
  current: unknown,
  selectedModel: string,
): Partial<DefaultModels> {
  const existing = isRecord(current) ? current : {};
  return {
    titleGeneration: stringValue(existing.titleGeneration) || selectedModel,
    relatedQuestions: stringValue(existing.relatedQuestions) || selectedModel,
    contextCompression:
      stringValue(existing.contextCompression) || selectedModel,
    promptOptimization:
      stringValue(existing.promptOptimization) || selectedModel,
    ragQuery: stringValue(existing.ragQuery) || selectedModel,
  };
}

function normalizeLegacyLanguage(value: unknown): string {
  const lang = stringValue(value).toLowerCase();
  if (lang === "zh" || lang === "zh-cn") return "zh";
  if (lang === "en" || lang === "en-us") return "en";
  return "auto";
}

export function ensureLegacyGeminiCoreSettingsMigration({
  localStorageRef,
  storageKeys,
  legacySetting,
  legacyModelState,
}: {
  localStorageRef: BrowserStorage;
  storageKeys: Pick<StorageKeys, "CORE_SETTINGS">;
  legacySetting?: LegacySetting;
  legacyModelState?: LegacyModelState;
}): void {
  const setting = legacySetting || readLegacySetting(localStorageRef);
  const hasLegacyCoreData =
    Boolean(stringValue(setting.apiKey)) ||
    Boolean(stringValue(setting.apiProxy)) ||
    Boolean(stringValue(setting.model)) ||
    Boolean(stringValue(setting.lang)) ||
    Array.isArray(legacyModelState?.models);

  if (!hasLegacyCoreData) return;

  const currentState = getPersistedState<CoreSettingsMigrationState>(
    localStorageRef.getItem(storageKeys.CORE_SETTINGS),
  );
  const selectedModel = normalizeFullGeminiModel(setting.model);
  const legacyProvider = buildLegacyGeminiProvider(setting, legacyModelState);

  const nextState: Partial<CoreSettingsMigrationState> = {
    ...currentState,
    theme: currentState.theme || "system",
    language:
      currentState.language && currentState.language !== "auto"
        ? currentState.language
        : normalizeLegacyLanguage(setting.lang),
    providers: mergeGeminiProvider(currentState.providers, legacyProvider),
    defaultModels: buildDefaultModels(
      currentState.defaultModels,
      selectedModel,
    ),
  };

  localStorageRef.setItem(
    storageKeys.CORE_SETTINGS,
    serializePersistedState<CoreSettingsMigrationState>(nextState),
  );
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function textFromLegacyPart(part: unknown): string {
  if (!isRecord(part)) return "";

  if (typeof part.text === "string") return part.text;

  if (isRecord(part.functionCall)) {
    const name = stringValue(part.functionCall.name) || "function";
    return `Function call: ${name}\n${safeJsonStringify(
      part.functionCall.args || {},
    )}`;
  }

  if (isRecord(part.functionResponse)) {
    const name = stringValue(part.functionResponse.name) || "function";
    return `Function response: ${name}\n${safeJsonStringify(
      part.functionResponse.response || part.functionResponse.content || {},
    )}`;
  }

  if (isRecord(part.executableCode)) {
    return stringValue(part.executableCode.code);
  }

  if (isRecord(part.codeExecutionResult)) {
    return stringValue(part.codeExecutionResult.output);
  }

  if (isRecord(part.fileData)) {
    return stringValue(part.fileData.fileUri)
      ? `[File: ${stringValue(part.fileData.fileUri)}]`
      : "";
  }

  if (isRecord(part.inlineData)) {
    const mimeType = stringValue(part.inlineData.mimeType);
    return mimeType ? `[Attachment: ${mimeType}]` : "";
  }

  return "";
}

function parseDataUrl(value: string): { mimeType?: string; data: string } {
  const match = value.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
  if (!match) return { data: value };

  return {
    mimeType: match[1],
    data: match[2] || "",
  };
}

function legacyAttachmentFromFileInfo(
  file: unknown,
  index: number,
): Attachment | null {
  if (!isRecord(file)) return null;

  const dataUrl = stringValue(file.dataUrl);
  const parsedData = dataUrl ? parseDataUrl(dataUrl) : null;
  const metadata = isRecord(file.metadata) ? file.metadata : {};
  const fileName =
    stringValue(file.displayName) ||
    stringValue(file.name) ||
    `attachment-${index + 1}`;
  const mimeType =
    stringValue(file.mimeType) ||
    parsedData?.mimeType ||
    "application/octet-stream";
  const url = stringValue(metadata.uri);
  const data = parsedData?.data;

  if (!data && !url) return null;

  return {
    id: stringValue(file.id) || `legacy_attachment_${index + 1}`,
    fileName,
    mimeType,
    ...(data ? { data } : {}),
    ...(url ? { url } : {}),
  };
}

function legacyAttachmentFromPart(
  part: unknown,
  index: number,
): Attachment | null {
  if (!isRecord(part)) return null;

  if (isRecord(part.inlineData)) {
    const mimeType =
      stringValue(part.inlineData.mimeType) || "application/octet-stream";
    const data = stringValue(part.inlineData.data);
    if (!data) return null;

    return {
      id: `legacy_part_${index + 1}`,
      fileName: `attachment-${index + 1}`,
      mimeType,
      data,
    };
  }

  if (isRecord(part.fileData)) {
    const url = stringValue(part.fileData.fileUri);
    if (!url) return null;

    return {
      id: `legacy_part_${index + 1}`,
      fileName: `attachment-${index + 1}`,
      mimeType:
        stringValue(part.fileData.mimeType) || "application/octet-stream",
      url,
    };
  }

  return null;
}

function normalizeLegacyAttachments(
  message: Record<string, any>,
): Attachment[] {
  const attachments: Attachment[] = [];
  const seen = new Set<string>();

  const add = (attachment: Attachment | null) => {
    if (!attachment) return;
    const key = attachment.url || `${attachment.fileName}:${attachment.data}`;
    if (seen.has(key)) return;
    seen.add(key);
    attachments.push(attachment);
  };

  if (Array.isArray(message.attachments)) {
    message.attachments.forEach((file, index) => {
      add(legacyAttachmentFromFileInfo(file, index));
    });
  }

  if (Array.isArray(message.parts)) {
    message.parts.forEach((part, index) => {
      add(legacyAttachmentFromPart(part, index));
    });
  }

  return attachments;
}

function normalizeLegacySearchSources(message: Record<string, any>) {
  const metadata = isRecord(message.groundingMetadata)
    ? message.groundingMetadata
    : {};
  const chunks = Array.isArray(metadata.groundingChunks)
    ? metadata.groundingChunks
    : [];
  const supports = Array.isArray(metadata.groundingSupports)
    ? metadata.groundingSupports
    : [];

  const sources = chunks
    .map((chunk) => (isRecord(chunk) && isRecord(chunk.web) ? chunk.web : null))
    .filter(isRecord)
    .map((web) => ({
      title: stringValue(web.title) || stringValue(web.uri) || "Source",
      url: stringValue(web.uri),
      content: supports
        .map((support) =>
          isRecord(support) && isRecord(support.segment)
            ? stringValue(support.segment.text)
            : "",
        )
        .filter(Boolean)
        .join("\n")
        .slice(0, 20_000),
    }))
    .filter((source) => source.url);
  return sources;
}

export function normalizeLegacyGeminiMessage(
  rawMessage: unknown,
  fallbackModel: string,
  fallbackTimestamp: number,
  index = 0,
): Message | null {
  if (!isRecord(rawMessage)) return null;

  const parts = Array.isArray(rawMessage.parts) ? rawMessage.parts : [];
  const content =
    parts.map(textFromLegacyPart).filter(Boolean).join("\n\n") ||
    stringValue(rawMessage.content);
  const timestamp = numberValue(rawMessage.timestamp) || fallbackTimestamp;
  const role = rawMessage.role === "model" ? "model" : "user";
  const attachments = normalizeLegacyAttachments(rawMessage);
  const searchSources = normalizeLegacySearchSources(rawMessage);

  const message: Message = {
    id: stringValue(rawMessage.id) || `legacy_message_${index + 1}`,
    role,
    content,
    timestamp,
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(role === "model" ? { model: fallbackModel } : {}),
    ...(searchSources.length > 0 ? { searchSources } : {}),
  };

  return message;
}

function normalizeLegacyMessages(
  value: unknown,
  fallbackModel: string,
): Message[] {
  if (!Array.isArray(value)) return [];

  const fallbackTimestamp = Date.now();
  return normalizeMessages(
    value
      .map((message, index) =>
        normalizeLegacyGeminiMessage(
          message,
          fallbackModel,
          fallbackTimestamp + index,
          index,
        ),
      )
      .filter((message): message is Message => Boolean(message)),
  );
}

function hasLegacyConversationData(conversation: LegacyConversation): boolean {
  return (
    Array.isArray(conversation.messages) ||
    Boolean(stringValue(conversation.title)) ||
    Boolean(stringValue(conversation.systemInstruction)) ||
    Boolean(stringValue(conversation.summary?.content))
  );
}

function titleFromMessages(messages: Message[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const content = firstUserMessage?.content.trim();
  if (!content) return "Migrated Chat";
  return content.replace(/\s+/g, " ").slice(0, 80);
}

function normalizeConversationId(value: unknown, fallback: string): string {
  return stringValue(value).slice(0, 160) || fallback;
}

function makeUniqueId(id: string, usedIds: Set<string>): string {
  if (!usedIds.has(id)) {
    usedIds.add(id);
    return id;
  }

  const base = `${id}-legacy`;
  let nextId = base;
  let counter = 2;
  while (usedIds.has(nextId)) {
    nextId = `${base}-${counter}`;
    counter += 1;
  }
  usedIds.add(nextId);
  return nextId;
}

function normalizeLegacySummary(
  summary: LegacySummary | undefined,
): Session["compression"] | undefined {
  const content = stringValue(summary?.content);
  const ids = Array.isArray(summary?.ids) ? summary.ids : [];
  const lastId = stringValue(ids[ids.length - 1]);
  if (!content || !lastId) return undefined;

  return {
    compressedContent: content,
    lastCompressedMessageId: lastId,
  };
}

function legacyConversationToSession(
  id: string,
  conversation: LegacyConversation,
  pinned: boolean,
  selectedModel: string,
): { session: Session; messages: Message[] } {
  const messages = normalizeLegacyMessages(
    conversation.messages,
    selectedModel,
  );
  const latestTimestamp =
    messages.reduce((latest, message) => {
      return Math.max(latest, message.timestamp);
    }, 0) || Date.now();

  const session = normalizeSession({
    id,
    title: stringValue(conversation.title) || titleFromMessages(messages),
    messageCount: messages.length,
    updatedAt: latestTimestamp,
    model: selectedModel,
    systemInstruction: stringValue(conversation.systemInstruction) || undefined,
    pinned,
    compression: normalizeLegacySummary(conversation.summary),
  });

  return { session, messages };
}

export function collectLegacyGeminiSessions({
  legacyChatState,
  legacyConversationState,
  selectedModel,
  existingSessionIds = new Set<string>(),
}: {
  legacyChatState?: LegacyChatState;
  legacyConversationState?: LegacyConversationState;
  selectedModel: string;
  existingSessionIds?: Set<string>;
}): {
  sessions: Session[];
  messagesBySessionId: Record<string, Message[]>;
  currentSessionId: string | null;
} {
  const usedIds = new Set(existingSessionIds);
  const entries = new Map<string, LegacyConversation>();
  const rawList = legacyConversationState?.conversationList;
  const pinnedIds = new Set(
    Array.isArray(legacyConversationState?.pinned)
      ? legacyConversationState.pinned.map(stringValue).filter(Boolean)
      : [],
  );
  const rawCurrentId = normalizeConversationId(
    legacyConversationState?.currentId,
    "default",
  );

  if (isRecord(rawList)) {
    for (const [id, conversation] of Object.entries(rawList)) {
      if (!isRecord(conversation)) continue;
      const legacyConversation = conversation as LegacyConversation;
      if (!hasLegacyConversationData(legacyConversation)) continue;
      entries.set(normalizeConversationId(id, `legacy-${entries.size + 1}`), {
        ...legacyConversation,
      });
    }
  }

  if (legacyChatState && hasLegacyConversationData(legacyChatState)) {
    entries.set(rawCurrentId, legacyChatState);
  }

  const sessions: Session[] = [];
  const messagesBySessionId: Record<string, Message[]> = {};
  const idMap = new Map<string, string>();

  for (const [rawId, conversation] of entries) {
    const id = makeUniqueId(rawId, usedIds);
    idMap.set(rawId, id);
    const migrated = legacyConversationToSession(
      id,
      conversation,
      pinnedIds.has(rawId),
      selectedModel,
    );
    sessions.push(migrated.session);
    messagesBySessionId[id] = migrated.messages;
  }

  return {
    sessions,
    messagesBySessionId,
    currentSessionId: idMap.get(rawCurrentId) || sessions[0]?.id || null,
  };
}

function mergeChatConfig(
  current: unknown,
  legacySetting: LegacySetting,
): ChatConfig {
  const temperature = numberValue(legacySetting.temperature);
  return normalizeChatConfig({
    ...normalizeChatConfig(current),
    ...(temperature !== undefined ? { temperature } : {}),
  });
}

async function migrateChatData({
  targetDb,
  storageKeys,
  legacyChatState,
  legacyConversationState,
  legacySetting,
}: {
  targetDb: AsyncKeyValueStorage;
  storageKeys: StorageKeys;
  legacyChatState?: LegacyChatState;
  legacyConversationState?: LegacyConversationState;
  legacySetting: LegacySetting;
}): Promise<boolean> {
  const currentPersisted = await targetDb.getItem(storageKeys.CHAT);
  const currentState = getPersistedState<ChatMigrationState>(currentPersisted);
  const currentSessions = Array.isArray(currentState.sessions)
    ? currentState.sessions
    : [];
  const selectedModel =
    stringValue(currentState.selectedModel) ||
    normalizeFullGeminiModel(legacySetting.model);
  const migrated = collectLegacyGeminiSessions({
    legacyChatState,
    legacyConversationState,
    selectedModel,
    existingSessionIds: new Set(
      currentSessions.map((session) => stringValue(session.id)),
    ),
  });

  if (migrated.sessions.length === 0) return false;

  for (const [sessionId, messages] of Object.entries(
    migrated.messagesBySessionId,
  )) {
    const messageKey = `session_messages_${sessionId}`;
    const existingMessages = await targetDb.getItem(messageKey);
    if (existingMessages === null || existingMessages === undefined) {
      await targetDb.setItem(messageKey, messages);
    }
  }

  const nextSessions =
    currentSessions.length > 0
      ? [...currentSessions, ...migrated.sessions]
      : migrated.sessions;
  const nextState: Partial<ChatMigrationState> = {
    ...currentState,
    sessions: nextSessions,
    workspaces: Array.isArray(currentState.workspaces)
      ? currentState.workspaces
      : [],
    currentSessionId:
      currentState.currentSessionId || migrated.currentSessionId,
    selectedModel,
    chatConfig: mergeChatConfig(
      currentState.chatConfig || DEFAULT_CHAT_CONFIG,
      legacySetting,
    ),
  };

  await targetDb.setItem(
    storageKeys.CHAT,
    serializePersistedState<ChatMigrationState>(nextState),
  );
  return true;
}

function normalizeLegacyVoiceLanguage(value: unknown) {
  const language = normalizeLegacyLanguage(value);
  return language === "auto" ? undefined : language;
}

function normalizeLegacyAgent(value: unknown): LobeAgent | null {
  if (!isRecord(value) || !isRecord(value.meta)) return null;

  const identifier = stringValue(value.identifier);
  if (!identifier) return null;

  const config = isRecord(value.config) ? value.config : {};
  return {
    identifier,
    meta: {
      avatar: stringValue(value.meta.avatar),
      description: stringValue(value.meta.description),
      tags: Array.isArray(value.meta.tags)
        ? value.meta.tags.map(stringValue).filter(Boolean)
        : [],
      title: stringValue(value.meta.title) || identifier,
      category: "General",
      systemRole: stringValue(config.systemRole),
    },
    createdAt: stringValue(value.createdAt),
    homepage: stringValue(value.homepage),
    author: stringValue(value.author),
    isCustom: true,
  };
}

function normalizeLegacyAgents(value: unknown): LobeAgent[] {
  if (!Array.isArray(value)) return [];

  const agents: LobeAgent[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const agent = normalizeLegacyAgent(item);
    if (!agent || seen.has(agent.identifier)) continue;
    seen.add(agent.identifier);
    agents.push(agent);
  }
  return agents;
}

async function migrateSettingsData({
  targetDb,
  storageKeys,
  legacyAssistantState,
  legacySetting,
}: {
  targetDb: AsyncKeyValueStorage;
  storageKeys: StorageKeys;
  legacyAssistantState?: LegacyAssistantState;
  legacySetting: LegacySetting;
}): Promise<boolean> {
  const legacyAgents = normalizeLegacyAgents(legacyAssistantState?.assistants);
  const sttLanguage = normalizeLegacyVoiceLanguage(legacySetting.sttLang);
  const ttsLanguage = normalizeLegacyVoiceLanguage(legacySetting.ttsLang);

  if (legacyAgents.length === 0 && !sttLanguage && !ttsLanguage) {
    return false;
  }

  const currentPersisted = await targetDb.getItem(storageKeys.SETTINGS);
  const currentState =
    getPersistedState<SettingsMigrationState>(currentPersisted);
  const currentAgents = Array.isArray(currentState.customAgents)
    ? currentState.customAgents
    : [];
  const currentAgentIds = new Set(
    currentAgents.map((agent) => stringValue(agent.identifier)),
  );
  const customAgents = [
    ...currentAgents,
    ...legacyAgents.filter((agent) => !currentAgentIds.has(agent.identifier)),
  ];

  const voice =
    sttLanguage || ttsLanguage
      ? {
          ...(isRecord(currentState.voice) ? currentState.voice : {}),
          ...(sttLanguage ? { sttLanguage } : {}),
          ...(ttsLanguage ? { ttsLanguage } : {}),
        }
      : currentState.voice;

  const nextState: Partial<SettingsMigrationState> = {
    ...currentState,
    customAgents,
    ...(voice ? { voice } : {}),
  };

  await targetDb.setItem(
    storageKeys.SETTINGS,
    serializePersistedState<SettingsMigrationState>(nextState),
  );
  return true;
}

async function readLegacyState<T>(
  storage: AsyncKeyValueStorage,
  key: string,
): Promise<Partial<T>> {
  try {
    return getPersistedState<T>(await storage.getItem(key));
  } catch {
    return {};
  }
}

export async function ensureLegacyGeminiNextChatMigration({
  targetDb,
  localStorageRef,
  storageKeys,
  legacyDb,
}: {
  targetDb: AsyncKeyValueStorage;
  localStorageRef: BrowserStorage;
  storageKeys: StorageKeys;
  legacyDb?: AsyncKeyValueStorage;
}): Promise<void> {
  if (legacyMigrationPromise) {
    await legacyMigrationPromise;
    return;
  }

  legacyMigrationPromise = (async () => {
    const marker = await targetDb.getItem(LEGACY_MIGRATION_MARKER);
    if (marker) return;

    const sourceDb = legacyDb || getLegacyDb();
    const legacySetting = readLegacySetting(localStorageRef);
    const [
      legacyChatState,
      legacyConversationState,
      legacyModelState,
      legacyAssistantState,
    ] = await Promise.all([
      readLegacyState<LegacyChatState>(sourceDb, LEGACY_CHAT_KEY),
      readLegacyState<LegacyConversationState>(
        sourceDb,
        LEGACY_CONVERSATION_KEY,
      ),
      readLegacyState<LegacyModelState>(sourceDb, LEGACY_MODEL_KEY),
      readLegacyState<LegacyAssistantState>(sourceDb, LEGACY_ASSISTANT_KEY),
    ]);

    const hasLegacyData =
      hasLegacyConversationData(legacyChatState) ||
      isRecord(legacyConversationState.conversationList) ||
      Array.isArray(legacyModelState.models) ||
      Array.isArray(legacyAssistantState.assistants) ||
      Boolean(stringValue(legacySetting.apiKey)) ||
      Boolean(stringValue(legacySetting.apiProxy)) ||
      Boolean(stringValue(legacySetting.model)) ||
      Boolean(stringValue(legacySetting.lang));

    if (!hasLegacyData) return;

    ensureLegacyGeminiCoreSettingsMigration({
      localStorageRef,
      storageKeys,
      legacySetting,
      legacyModelState,
    });

    const [chatMigrated, settingsMigrated] = await Promise.all([
      migrateChatData({
        targetDb,
        storageKeys,
        legacyChatState,
        legacyConversationState,
        legacySetting,
      }),
      migrateSettingsData({
        targetDb,
        storageKeys,
        legacyAssistantState,
        legacySetting,
      }),
    ]);

    await targetDb.setItem(LEGACY_MIGRATION_MARKER, {
      migratedAt: Date.now(),
      chatMigrated,
      settingsMigrated,
    });
  })();

  await legacyMigrationPromise;
}
