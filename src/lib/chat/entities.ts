import type {
  Attachment,
  Session,
  SessionConfig,
  Workspace,
} from "../../types";
import { ATTACHMENT_LIMITS, CHAT_ENTITY_LIMITS } from "../../config/limits";
import { normalizePluginIdRefs } from "../plugin/config";
import { normalizeSkillIdRefs } from "../skills";
import { normalizeCompressedContent } from "../utils/contextCompression";
import { isReasoningEnabled, normalizeReasoningMode } from "./reasoning";

const WORKSPACE_COLORS = new Set([
  "blue",
  "purple",
  "green",
  "orange",
  "red",
  "pink",
  "cyan",
  "gray",
]);

function trimString(value: unknown, maxChars: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, maxChars);
  return trimmed || fallback;
}

function stripWrappingQuotes(value: string): string {
  let current = value.trim();

  for (let i = 0; i < 3; i += 1) {
    const first = current[0];
    const last = current[current.length - 1];
    if (
      current.length >= 2 &&
      ((first === `"` && last === `"`) ||
        (first === "'" && last === "'") ||
        (first === "`" && last === "`"))
    ) {
      current = current.slice(1, -1).trim();
      continue;
    }

    break;
  }

  return current;
}

function normalizeTitleLine(value: string): string {
  let title = stripWrappingQuotes(value);

  title = title
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\s*(?:[-*+]\s+|\u2022\s+|\d+[\.)]\s*)/, "")
    .replace(/^(?:title|\u6807\u9898)\s*[:\uff1a]\s*/i, "")
    .trim();

  title = stripWrappingQuotes(title);
  return title.replace(/\s+/g, " ").trim();
}

export function normalizeSessionTitle(
  value: unknown,
  fallback = "New Chat",
): string {
  if (typeof value !== "string") return fallback;

  const withoutControlChars = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  const withoutCodeFence = withoutControlChars
    .trim()
    .replace(/^```[^\n]*\n?/, "")
    .replace(/\n?```\s*$/, "");
  const title =
    withoutCodeFence.split("\n").map(normalizeTitleLine).find(Boolean) || "";
  const trimmed = title
    .slice(0, CHAT_ENTITY_LIMITS.maxSessionTitleChars)
    .trim();

  return trimmed || fallback;
}

function normalizeAttachment(attachment: unknown): Attachment | null {
  if (!attachment || typeof attachment !== "object") return null;

  const raw = attachment as Partial<Attachment>;
  const id = trimString(raw.id, 120);
  const fileName = trimString(raw.fileName, ATTACHMENT_LIMITS.maxFileNameChars);
  const mimeType = trimString(raw.mimeType, ATTACHMENT_LIMITS.maxMimeTypeChars);
  const data =
    typeof raw.data === "string"
      ? raw.data.slice(0, ATTACHMENT_LIMITS.maxBase64Chars)
      : undefined;
  const url =
    typeof raw.url === "string"
      ? raw.url.trim().slice(0, ATTACHMENT_LIMITS.maxUrlChars)
      : undefined;

  if (!fileName || !mimeType || (!data && !url)) return null;

  return {
    id,
    fileName,
    mimeType,
    ...(data ? { data } : {}),
    ...(url ? { url } : {}),
  };
}

function normalizeWorkspaceFiles(files: unknown): Attachment[] {
  if (!Array.isArray(files)) return [];

  const normalized: Attachment[] = [];
  let totalInlineChars = 0;

  for (const file of files) {
    const attachment = normalizeAttachment(file);
    if (!attachment) continue;

    const inlineChars = attachment.data?.length || 0;
    if (
      inlineChars > 0 &&
      totalInlineChars + inlineChars > ATTACHMENT_LIMITS.maxTotalBase64Chars
    ) {
      continue;
    }

    totalInlineChars += inlineChars;
    normalized.push(attachment);
    if (normalized.length >= ATTACHMENT_LIMITS.maxCount) break;
  }

  return normalized;
}

function normalizeKnowledgeCollectionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const id = trimString(
      item,
      CHAT_ENTITY_LIMITS.maxWorkspaceKnowledgeCollectionIdChars,
    );
    if (!id || seen.has(id)) continue;

    ids.push(id);
    seen.add(id);
    if (ids.length >= CHAT_ENTITY_LIMITS.maxWorkspaceKnowledgeCollections) {
      break;
    }
  }

  return ids;
}

function normalizeSessionCompression(
  compression: Session["compression"],
): Session["compression"] | undefined {
  if (!compression || typeof compression !== "object") return undefined;

  const lastCompressedMessageId = trimString(
    compression.lastCompressedMessageId,
    120,
  );
  const compressedContent =
    typeof compression.compressedContent === "string"
      ? normalizeCompressedContent(compression.compressedContent)
      : "";

  if (!lastCompressedMessageId || !compressedContent) return undefined;

  return {
    compressedContent,
    lastCompressedMessageId,
  };
}

function normalizeSessionMemoryContext(
  memoryContext: Session["memoryContext"],
): Session["memoryContext"] | undefined {
  if (!memoryContext || typeof memoryContext !== "object") return undefined;
  const injectedMemoryIds: string[] = [];
  const seen = new Set<string>();

  for (const value of Array.isArray(memoryContext.injectedMemoryIds)
    ? memoryContext.injectedMemoryIds
    : []) {
    const id = trimString(value, 160);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    injectedMemoryIds.push(id);
    if (injectedMemoryIds.length >= 200) break;
  }

  if (injectedMemoryIds.length === 0) return undefined;
  return {
    injectedMemoryIds,
    ...(typeof memoryContext.updatedAt === "number" &&
    Number.isFinite(memoryContext.updatedAt)
      ? { updatedAt: Math.floor(memoryContext.updatedAt) }
      : {}),
  };
}

export function normalizeSessionConfig(
  config?: SessionConfig,
): SessionConfig | undefined {
  if (!config) return undefined;
  const {
    activePlugins: rawActivePlugins,
    activeSkills: rawActiveSkills,
    reasoningMode: rawReasoningMode,
    useReasoning: rawUseReasoning,
    ...rest
  } = config;
  const activePlugins = normalizePluginIdRefs(rawActivePlugins);
  const activeSkills = normalizeSkillIdRefs(rawActiveSkills, []);
  const hasReasoningConfig =
    rawReasoningMode !== undefined || rawUseReasoning !== undefined;
  const reasoningMode = hasReasoningConfig
    ? normalizeReasoningMode(rawReasoningMode, rawUseReasoning)
    : undefined;

  return {
    ...rest,
    ...(reasoningMode
      ? {
          useReasoning: isReasoningEnabled(reasoningMode),
          reasoningMode,
        }
      : {}),
    ...(activePlugins.length > 0 ? { activePlugins } : {}),
    ...(activeSkills.length > 0 ? { activeSkills } : {}),
  };
}

export function normalizeSession(session: Session): Session {
  return {
    ...session,
    title: normalizeSessionTitle(session.title),
    systemInstruction:
      typeof session.systemInstruction === "string"
        ? session.systemInstruction.slice(
            0,
            CHAT_ENTITY_LIMITS.maxSessionSystemInstructionChars,
          )
        : undefined,
    messageCount: Math.max(0, Math.floor(Number(session.messageCount) || 0)),
    updatedAt: Number.isFinite(Number(session.updatedAt))
      ? Number(session.updatedAt)
      : Date.now(),
    pinned: session.pinned === true,
    config: normalizeSessionConfig(session.config),
    compression: normalizeSessionCompression(session.compression),
    memoryContext: normalizeSessionMemoryContext(session.memoryContext),
  };
}

export function normalizeWorkspace(workspace: Workspace): Workspace {
  const color = trimString(
    workspace.color,
    CHAT_ENTITY_LIMITS.maxWorkspaceColorChars,
  );

  return {
    ...workspace,
    name: trimString(
      workspace.name,
      CHAT_ENTITY_LIMITS.maxWorkspaceNameChars,
      "Workspace",
    ),
    systemPrompt:
      typeof workspace.systemPrompt === "string"
        ? workspace.systemPrompt.slice(
            0,
            CHAT_ENTITY_LIMITS.maxWorkspaceSystemPromptChars,
          )
        : undefined,
    knowledgeCollectionIds: normalizeKnowledgeCollectionIds(
      workspace.knowledgeCollectionIds,
    ),
    files: normalizeWorkspaceFiles(workspace.files),
    color: WORKSPACE_COLORS.has(color) ? color : "blue",
    enableSearch: workspace.enableSearch === true,
    enableReasoning: workspace.enableReasoning === true,
    activePlugins: normalizePluginIdRefs(workspace.activePlugins),
    activeSkills: normalizeSkillIdRefs(workspace.activeSkills, []),
    createdAt: Number.isFinite(Number(workspace.createdAt))
      ? Number(workspace.createdAt)
      : Date.now(),
  };
}
