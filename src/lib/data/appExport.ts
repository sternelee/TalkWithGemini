import {
  appDb,
  STORAGE_KEYS,
  STORAGE_VERSION,
} from "@/store/storage/storageConfig";
import { flushSessionMessageWrites } from "@/store/sessionMessagePersistence";

export const APP_EXPORT_VERSION = 2;

const SESSION_MESSAGES_PREFIX = "session_messages_";

export interface AppExportInput {
  exportedAt?: string;
  coreSettings?: unknown;
  settings?: unknown;
  chat?: unknown;
  sessionMessages?: Record<string, unknown>;
  knowledge?: unknown;
  memory?: unknown;
}

export interface AppExportPayload {
  exportVersion: typeof APP_EXPORT_VERSION;
  storageVersion: typeof STORAGE_VERSION;
  exportedAt: string;
  metadata: {
    opfs: {
      mode: "references-only";
      includesBlobs: false;
    };
  };
  data: {
    coreSettings?: unknown;
    settings?: unknown;
    chat?: unknown;
    sessionMessages: Record<string, unknown>;
    knowledge?: unknown;
    memory?: unknown;
  };
}

const APP_OPFS_PREFIXES = [
  "opfs://knowledge-base/",
  "opfs://workspaces/",
  "opfs://images/",
  "opfs://chat/",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isOpfsUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("opfs://");
}

function isAppOwnedOpfsUrl(value: string): boolean {
  return APP_OPFS_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function collectKnownOpfsFields(value: unknown, output: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKnownOpfsFields(item, output));
    return;
  }

  if (!isRecord(value)) return;

  for (const key of ["url", "path", "opfsUrl"]) {
    const field = value[key];
    if (isOpfsUrl(field)) output.add(field);
  }

  for (const nestedValue of Object.values(value)) {
    collectKnownOpfsFields(nestedValue, output);
  }
}

function parseStoredValue(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function createAppExportPayload(
  input: AppExportInput,
): AppExportPayload {
  return {
    exportVersion: APP_EXPORT_VERSION,
    storageVersion: STORAGE_VERSION,
    exportedAt: input.exportedAt || new Date().toISOString(),
    metadata: {
      opfs: {
        mode: "references-only",
        includesBlobs: false,
      },
    },
    data: {
      coreSettings: input.coreSettings,
      settings: input.settings,
      chat: input.chat,
      sessionMessages: input.sessionMessages ?? {},
      knowledge: input.knowledge,
      memory: input.memory,
    },
  };
}

export async function createBrowserAppExportPayload(): Promise<AppExportPayload> {
  await flushSessionMessageWrites();
  const [settings, chat, knowledge, memory, keys] = await Promise.all([
    appDb.getItem<unknown>(STORAGE_KEYS.SETTINGS),
    appDb.getItem<unknown>(STORAGE_KEYS.CHAT),
    appDb.getItem<unknown>(STORAGE_KEYS.KNOWLEDGE),
    appDb.getItem<unknown>(STORAGE_KEYS.MEMORY),
    appDb.keys(),
  ]);
  const sessionMessageKeys = keys.filter((key) =>
    key.startsWith(SESSION_MESSAGES_PREFIX),
  );
  const sessionMessages = Object.fromEntries(
    await Promise.all(
      sessionMessageKeys.map(async (key) => [
        key.slice(SESSION_MESSAGES_PREFIX.length),
        await appDb.getItem<unknown>(key),
      ]),
    ),
  );
  const coreSettings =
    typeof window === "undefined"
      ? undefined
      : window.localStorage.getItem(STORAGE_KEYS.CORE_SETTINGS);

  return createAppExportPayload({
    coreSettings: parseStoredValue(coreSettings),
    settings: parseStoredValue(settings),
    chat: parseStoredValue(chat),
    sessionMessages,
    knowledge: parseStoredValue(knowledge),
    memory: parseStoredValue(memory),
  });
}

export function collectReferencedOpfsUrls(input: {
  chat?: unknown;
  knowledge?: unknown;
}): Set<string> {
  const urls = new Set<string>();
  collectKnownOpfsFields(input.chat, urls);
  collectKnownOpfsFields(input.knowledge, urls);
  return urls;
}

export function collectOrphanOpfsUrls(input: {
  existingUrls: Iterable<string>;
  referencedUrls: Iterable<string>;
}): string[] {
  const referencedUrls = new Set(input.referencedUrls);

  return [...input.existingUrls]
    .filter((url) => isAppOwnedOpfsUrl(url) && !referencedUrls.has(url))
    .sort();
}
