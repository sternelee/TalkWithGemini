import type { Attachment, RAGConfig } from "../../types";
import { parseDocumentFile } from "../../services/api/docParseService";
import { resolveDocumentParseToken } from "../security/localSecretResolvers";

const TEXT_MIME_TYPES = new Set([
  "application/javascript",
  "application/json",
  "application/ld+json",
  "application/sql",
  "application/typescript",
  "application/xhtml+xml",
  "application/xml",
  "application/x-httpd-php",
  "application/x-sh",
  "application/x-yaml",
  "text/markdown",
]);

const TEXT_EXTENSION_RE =
  /\.(?:c|cc|conf|cpp|cs|css|csv|go|gql|graphql|h|hpp|htm|html|ini|java|js|json|jsonl|jsx|kt|log|md|markdown|php|py|rb|rs|sh|sql|svg|swift|toml|ts|tsx|txt|xml|yaml|yml)$/iu;

export interface ChatDocumentAttachmentResult {
  attachment: Attachment;
  parsed: boolean;
}

function normalizeMimeType(value: string | undefined, fallback = "text/plain") {
  return (value || fallback).trim().toLowerCase();
}

export function isTextDocumentMimeType(mimeType: string | undefined): boolean {
  const normalized = normalizeMimeType(mimeType, "");
  if (!normalized) return false;
  return (
    normalized.startsWith("text/") ||
    TEXT_MIME_TYPES.has(normalized) ||
    normalized.endsWith("+json") ||
    normalized.endsWith("+xml")
  );
}

export function isTextDocumentFile(file: Pick<File, "name" | "type">) {
  return (
    isTextDocumentMimeType(file.type) ||
    (!file.type && TEXT_EXTENSION_RE.test(file.name)) ||
    file.type === "application/octet-stream" && TEXT_EXTENSION_RE.test(file.name)
  );
}

export function encodeTextToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.slice(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function decodeBase64Text(data: string): string {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

export function decodeAttachmentText(attachment: Pick<Attachment, "data">) {
  return attachment.data ? decodeBase64Text(attachment.data) : "";
}

async function parseFileToMarkdown(
  file: File,
  rag: RAGConfig,
): Promise<string> {
  const provider = rag.documentParseProvider || "mineru";
  const useDefault = Boolean(
    rag.useDefaultDocumentProcessing && rag.serverDocumentProcessingAvailable,
  );
  const apiKey = useDefault
    ? undefined
    : await resolveDocumentParseToken(provider, rag);

  if (provider === "llamaParse" && !useDefault && !apiKey) {
    throw new Error(
      "Configure a document parser API key to process non-text files.",
    );
  }

  const markdown = await parseDocumentFile(file, {
    provider,
    apiKey,
    useDefault,
  });
  if (!markdown.trim()) {
    throw new Error("No text content extracted.");
  }
  return markdown;
}

export async function createChatDocumentAttachment(
  file: File,
  {
    id,
    rag,
  }: {
    id: string;
    rag: RAGConfig;
  },
): Promise<ChatDocumentAttachmentResult> {
  if (isTextDocumentFile(file)) {
    const text = await file.text();
    return {
      attachment: {
        id,
        mimeType: file.type || "text/plain",
        data: encodeTextToBase64(text),
        fileName: file.name,
      },
      parsed: false,
    };
  }

  const markdown = await parseFileToMarkdown(file, rag);
  return {
    attachment: {
      id,
      mimeType: "text/markdown",
      data: encodeTextToBase64(markdown),
      fileName: file.name,
    },
    parsed: true,
  };
}
