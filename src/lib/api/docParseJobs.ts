import "server-only";

import { strFromU8, unzipSync } from "fflate";
import { v7 as uuidv7 } from "uuid";
import { DOCUMENT_LIMITS } from "@/config/limits";
import type { DocumentParseProvider } from "@/types";
import type { EncryptedSecretEnvelope } from "@/lib/byok/shared";
import { BYOK_CONTEXTS } from "@/lib/byok/shared";
import { decryptSecretEnvelope } from "@/lib/byok/server";
import { getDefaultDocumentParseToken } from "@/lib/defaultConfig/server";
import {
  safeFetchArrayBuffer,
  safeFetchJson,
  safeFetchText,
} from "@/lib/security/safeFetch";
import { safeFetchSharedStoreJson } from "../security/sharedStoreFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import { getDeploymentMode } from "../security/deployment";

const LLAMA_PARSE_URL = "https://api.cloud.llamaindex.ai/api/v2/parse";
const MINERU_AGENT_URL = "https://mineru.net/api/v1/agent";
const MINERU_PRECISE_URL = "https://mineru.net/api/v4";
const JOB_TTL_MS = 10 * 60 * 1000;
const MINERU_FULL_MARKDOWN_PATH_RE = /(?:^|\/)full\.md$/u;

export type DocumentParseJobStatus = "pending" | "completed" | "failed";

export interface DocumentParseJob {
  id: string;
  secret: string;
  provider: DocumentParseProvider;
  mode?: "llama-parse" | "mineru-agent" | "mineru-precise";
  upstreamJobId: string;
  credential:
    | { kind: "none" }
    | { kind: "default" }
    | {
        kind: "encrypted";
        provider?: DocumentParseProvider;
        apiKeySecret: EncryptedSecretEnvelope;
      };
  createdAt: number;
}

export interface DocumentParseJobStore {
  create(job: DocumentParseJob, ttlMs: number): Promise<void>;
  get(id: string, now?: number): Promise<DocumentParseJob | undefined>;
  delete(id: string): Promise<boolean>;
  expire?(now?: number): Promise<void>;
  clear?(): void;
}

declare global {
  var __neoChatDocumentParseJobs: Map<string, DocumentParseJob> | undefined;
}

class MemoryDocumentParseJobStore implements DocumentParseJobStore {
  private get store(): Map<string, DocumentParseJob> {
    if (!globalThis.__neoChatDocumentParseJobs) {
      globalThis.__neoChatDocumentParseJobs = new Map();
    }
    return globalThis.__neoChatDocumentParseJobs;
  }

  async create(job: DocumentParseJob, ttlMs = JOB_TTL_MS): Promise<void> {
    void ttlMs;
    this.store.set(job.id, job);
  }

  async get(
    id: string,
    now = Date.now(),
  ): Promise<DocumentParseJob | undefined> {
    await this.expire(now);
    return this.store.get(id);
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async expire(now = Date.now()): Promise<void> {
    for (const [id, job] of this.store) {
      if (now - job.createdAt > JOB_TTL_MS) {
        this.store.delete(id);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }
}

class UpstashDocumentParseJobStore implements DocumentParseJobStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private key(id: string): string {
    return `neo:doc-parse:${id}`;
  }

  private endpoint(path: string): string {
    return `${this.url.replace(/\/+$/, "")}/${path}`;
  }

  async create(job: DocumentParseJob, ttlMs: number): Promise<void> {
    const { response } = await safeFetchSharedStoreJson(this.endpoint("set"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        this.key(job.id),
        JSON.stringify(job),
        "PX",
        ttlMs,
      ]),
    });
    if (!response.ok) {
      throw new Error(
        `Document job store failed with status ${response.status}`,
      );
    }
  }

  async get(id: string): Promise<DocumentParseJob | undefined> {
    const { response, data } = await safeFetchSharedStoreJson<{
      result?: string | null;
    }>(this.endpoint(`get/${encodeURIComponent(this.key(id))}`), {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) {
      throw new Error(
        `Document job store failed with status ${response.status}`,
      );
    }

    if (!data.result) return undefined;
    return JSON.parse(data.result) as DocumentParseJob;
  }

  async delete(id: string): Promise<boolean> {
    const { response } = await safeFetchSharedStoreJson(
      this.endpoint(`del/${encodeURIComponent(this.key(id))}`),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}` },
      },
    );
    return response.ok;
  }
}

const memoryJobStore = new MemoryDocumentParseJobStore();
let configuredJobStore: DocumentParseJobStore | null = null;
const SHARED_DOCUMENT_JOB_STORE_ERROR =
  "DOCUMENT_PARSE_JOB_STORE=upstash with UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN is required in hosted mode";

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function isSharedStoreName(store: string): boolean {
  return store === "upstash" || store === "redis" || store === "kv";
}

function canUseMemoryFallback(): boolean {
  return getDeploymentMode() === "local";
}

function createDocumentParseJobStore(): DocumentParseJobStore {
  const store = env("DOCUMENT_PARSE_JOB_STORE").toLowerCase();
  const upstashUrl = env("UPSTASH_REDIS_REST_URL");
  const upstashToken = env("UPSTASH_REDIS_REST_TOKEN");
  if (isSharedStoreName(store) && upstashUrl && upstashToken) {
    return new UpstashDocumentParseJobStore(upstashUrl, upstashToken);
  }
  if (isSharedStoreName(store) || getDeploymentMode() === "hosted") {
    throw new Error(SHARED_DOCUMENT_JOB_STORE_ERROR);
  }
  return memoryJobStore;
}

function getDocumentParseJobStore(): DocumentParseJobStore {
  if (!configuredJobStore) configuredJobStore = createDocumentParseJobStore();
  return configuredJobStore;
}

export function setDocumentParseJobStoreForTesting(
  store: DocumentParseJobStore | null,
): void {
  configuredJobStore = store;
}

function getCredentialContext(provider: DocumentParseProvider): string {
  return provider === "mineru"
    ? BYOK_CONTEXTS.mineru
    : BYOK_CONTEXTS.llamaParse;
}

function getJobProvider(job: DocumentParseJob): DocumentParseProvider {
  return job.provider || "llamaParse";
}

export function isDocumentParseJobSecretValid(
  job: DocumentParseJob,
  secret: string | null | undefined,
): boolean {
  return Boolean(job.secret && secret && job.secret === secret);
}

async function resolveJobToken(job: DocumentParseJob): Promise<string> {
  const provider = getJobProvider(job);
  if (job.credential.kind === "none") return "";
  if (job.credential.kind === "default") {
    return getDefaultDocumentParseToken(provider);
  }
  return decryptSecretEnvelope(
    job.credential.apiKeySecret,
    getCredentialContext(job.credential.provider || provider),
  );
}

async function storeDocumentParseJob(job: DocumentParseJob): Promise<void> {
  try {
    await getDocumentParseJobStore().create(job, JOB_TTL_MS);
  } catch (error) {
    if (!canUseMemoryFallback()) throw error;
    await memoryJobStore.create(job, JOB_TTL_MS);
  }
}

export interface CreateDocumentParseJobOptions {
  provider: DocumentParseProvider;
  apiKey?: string;
  credential:
    | { kind: "none" }
    | { kind: "default" }
    | {
        kind: "encrypted";
        provider?: DocumentParseProvider;
        apiKeySecret: EncryptedSecretEnvelope;
      };
}

function createUpstreamError(message: string, status?: number): Error {
  const error = new Error(message);
  if (status !== undefined) {
    (error as Error & { statusCode?: number }).statusCode = status;
  }
  return error;
}

function getMineruMessage(data: any, fallback: string): string {
  return typeof data?.msg === "string" && data.msg.trim()
    ? data.msg.trim()
    : fallback;
}

function assertMineruCodeOk(data: any, fallback: string) {
  if (data?.code === 0) return;
  throw new Error(getMineruMessage(data, fallback));
}

async function uploadSignedDocumentFile(file: File, url: string) {
  const { response } = await safeFetchText(
    url,
    {
      method: "PUT",
      body: file,
    },
    {
      policy: getSafeUrlPolicy("docs"),
      timeoutMs: 60_000,
      maxResponseBytes: 1024 * 1024,
    },
  );

  if (!response.ok) {
    throw createUpstreamError(
      `Mineru signed upload failed with status ${response.status}`,
      response.status,
    );
  }
}

async function createLlamaParseJob(
  file: File,
  options: CreateDocumentParseJobOptions,
): Promise<DocumentParseJob> {
  const apiKey = options.apiKey?.trim() || "";
  if (!apiKey) {
    throw new Error("Document parse API key is required");
  }

  const configuration = {
    tier: "cost_effective",
    version: "latest",
    output_options: {
      markdown: {
        annotate_links: true,
        tables: {
          compact_markdown_tables: true,
          output_tables_as_markdown: true,
          merge_continued_tables: true,
        },
      },
    },
    processing_options: {
      ignore: {
        ignore_diagonal_text: true,
        ignore_text_in_image: true,
        ignore_hidden_text: true,
      },
    },
  };

  const uploadFormData = new FormData();
  uploadFormData.append("file", file);
  uploadFormData.append("configuration", JSON.stringify(configuration));

  const { response, data } = await safeFetchJson<any>(
    `${LLAMA_PARSE_URL}/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: uploadFormData,
    },
    {
      policy: getSafeUrlPolicy("docs"),
      timeoutMs: 60_000,
      maxResponseBytes: 1024 * 1024,
    },
  );

  if (!response.ok) {
    throw createUpstreamError(
      `LlamaParse upload failed with status ${response.status}`,
      response.status,
    );
  }

  if (typeof data?.id !== "string" || !data.id.trim()) {
    throw new Error("LlamaParse upload did not return a job id");
  }

  return {
    id: uuidv7(),
    secret: uuidv7(),
    provider: "llamaParse",
    mode: "llama-parse",
    upstreamJobId: data.id,
    credential: options.credential,
    createdAt: Date.now(),
  };
}

async function createMineruAgentJob(
  file: File,
  options: CreateDocumentParseJobOptions,
): Promise<DocumentParseJob> {
  const { response, data } = await safeFetchJson<any>(
    `${MINERU_AGENT_URL}/parse/file`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file_name: file.name,
        language: "ch",
        enable_table: true,
        is_ocr: false,
        enable_formula: true,
      }),
    },
    {
      policy: getSafeUrlPolicy("docs"),
      timeoutMs: 30_000,
      maxResponseBytes: 1024 * 1024,
    },
  );

  if (!response.ok) {
    throw createUpstreamError(
      `Mineru task creation failed with status ${response.status}`,
      response.status,
    );
  }
  assertMineruCodeOk(data, "Mineru task creation failed");

  const taskId = data?.data?.task_id;
  const fileUrl = data?.data?.file_url;
  if (typeof taskId !== "string" || !taskId.trim()) {
    throw new Error("Mineru task creation did not return a task id");
  }
  if (typeof fileUrl !== "string" || !fileUrl.trim()) {
    throw new Error("Mineru task creation did not return an upload URL");
  }

  await uploadSignedDocumentFile(file, fileUrl);

  return {
    id: uuidv7(),
    secret: uuidv7(),
    provider: "mineru",
    mode: "mineru-agent",
    upstreamJobId: taskId,
    credential: options.credential,
    createdAt: Date.now(),
  };
}

async function createMineruPreciseJob(
  file: File,
  options: CreateDocumentParseJobOptions,
): Promise<DocumentParseJob> {
  const apiKey = options.apiKey?.trim() || "";
  if (!apiKey) {
    throw new Error("Document parse API token is required");
  }

  const { response, data } = await safeFetchJson<any>(
    `${MINERU_PRECISE_URL}/file-urls/batch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: [{ name: file.name }],
        model_version: "vlm",
      }),
    },
    {
      policy: getSafeUrlPolicy("docs"),
      timeoutMs: 30_000,
      maxResponseBytes: 1024 * 1024,
    },
  );

  if (!response.ok) {
    throw createUpstreamError(
      `Mineru upload URL creation failed with status ${response.status}`,
      response.status,
    );
  }
  assertMineruCodeOk(data, "Mineru upload URL creation failed");

  const batchId = data?.data?.batch_id;
  const fileUrl = Array.isArray(data?.data?.file_urls)
    ? data.data.file_urls[0]
    : undefined;
  if (typeof batchId !== "string" || !batchId.trim()) {
    throw new Error("Mineru upload URL creation did not return a batch id");
  }
  if (typeof fileUrl !== "string" || !fileUrl.trim()) {
    throw new Error("Mineru upload URL creation did not return an upload URL");
  }

  await uploadSignedDocumentFile(file, fileUrl);

  return {
    id: uuidv7(),
    secret: uuidv7(),
    provider: "mineru",
    mode: "mineru-precise",
    upstreamJobId: batchId,
    credential: options.credential,
    createdAt: Date.now(),
  };
}

export async function createDocumentParseJob(
  file: File,
  options: CreateDocumentParseJobOptions,
): Promise<DocumentParseJob> {
  await getDocumentParseJobStore().expire?.();

  const job =
    options.provider === "llamaParse"
      ? await createLlamaParseJob(file, options)
      : options.apiKey?.trim()
        ? await createMineruPreciseJob(file, options)
        : await createMineruAgentJob(file, options);

  await storeDocumentParseJob(job);
  return job;
}

export async function getDocumentParseJob(
  id: string,
): Promise<DocumentParseJob | undefined> {
  try {
    return await getDocumentParseJobStore().get(id);
  } catch (error) {
    if (!canUseMemoryFallback()) throw error;
    return memoryJobStore.get(id);
  }
}

export async function deleteDocumentParseJob(id: string): Promise<boolean> {
  let deleted = false;
  try {
    deleted = await getDocumentParseJobStore().delete(id);
  } catch (error) {
    if (!canUseMemoryFallback()) throw error;
    deleted = false;
  }
  return (await memoryJobStore.delete(id)) || deleted;
}

export async function pollDocumentParseJob(
  job: DocumentParseJob,
): Promise<
  | { status: "pending" }
  | { status: "completed"; markdown: string }
  | { status: "failed"; error: string }
> {
  const provider = getJobProvider(job);
  if (provider === "mineru") {
    return pollMineruDocumentParseJob(job);
  }

  const apiKey = await resolveJobToken(job);
  if (!apiKey) {
    await deleteDocumentParseJob(job.id);
    return {
      status: "failed",
      error: "Document parse API key is no longer available",
    };
  }

  const { response, data } = await safeFetchJson<any>(
    `${LLAMA_PARSE_URL}/${encodeURIComponent(job.upstreamJobId)}?expand=markdown`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
    {
      policy: getSafeUrlPolicy("docs"),
      timeoutMs: 30_000,
      maxResponseBytes: 20 * 1024 * 1024,
    },
  );

  if (!response.ok) {
    if (response.status === 400) return { status: "pending" };
    return {
      status: "failed",
      error: `LlamaParse status check failed with status ${response.status}`,
    };
  }

  if (data.job?.status === "COMPLETED") {
    await deleteDocumentParseJob(job.id);
    return {
      status: "completed",
      markdown:
        data.markdown?.pages?.map((page: any) => page.markdown).join("\n\n") ||
        "",
    };
  }

  if (data.job?.status === "FAILED") {
    await deleteDocumentParseJob(job.id);
    return { status: "failed", error: "LlamaParse job failed" };
  }

  return { status: "pending" };
}

async function pollMineruDocumentParseJob(
  job: DocumentParseJob,
): ReturnType<typeof pollDocumentParseJob> {
  return job.mode === "mineru-precise"
    ? pollMineruPreciseJob(job)
    : pollMineruAgentJob(job);
}

async function pollMineruAgentJob(
  job: DocumentParseJob,
): ReturnType<typeof pollDocumentParseJob> {
  const { response, data } = await safeFetchJson<any>(
    `${MINERU_AGENT_URL}/parse/${encodeURIComponent(job.upstreamJobId)}`,
    {
      method: "GET",
    },
    {
      policy: getSafeUrlPolicy("docs"),
      timeoutMs: 30_000,
      maxResponseBytes: 1024 * 1024,
    },
  );

  if (!response.ok) {
    return {
      status: "failed",
      error: `Mineru status check failed with status ${response.status}`,
    };
  }
  assertMineruCodeOk(data, "Mineru status check failed");

  const state = data?.data?.state;
  if (state === "done") {
    const markdownUrl = data?.data?.markdown_url;
    if (typeof markdownUrl !== "string" || !markdownUrl.trim()) {
      await deleteDocumentParseJob(job.id);
      return { status: "failed", error: "Mineru did not return Markdown URL" };
    }

    const markdown = await downloadMarkdown(markdownUrl);
    await deleteDocumentParseJob(job.id);
    return { status: "completed", markdown };
  }

  if (state === "failed") {
    await deleteDocumentParseJob(job.id);
    return {
      status: "failed",
      error: data?.data?.err_msg || "Mineru job failed",
    };
  }

  return { status: "pending" };
}

async function pollMineruPreciseJob(
  job: DocumentParseJob,
): ReturnType<typeof pollDocumentParseJob> {
  const apiKey = await resolveJobToken(job);
  if (!apiKey) {
    await deleteDocumentParseJob(job.id);
    return {
      status: "failed",
      error: "Document parse API token is no longer available",
    };
  }

  const { response, data } = await safeFetchJson<any>(
    `${MINERU_PRECISE_URL}/extract-results/batch/${encodeURIComponent(
      job.upstreamJobId,
    )}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
    {
      policy: getSafeUrlPolicy("docs"),
      timeoutMs: 30_000,
      maxResponseBytes: 1024 * 1024,
    },
  );

  if (!response.ok) {
    return {
      status: "failed",
      error: `Mineru status check failed with status ${response.status}`,
    };
  }
  assertMineruCodeOk(data, "Mineru status check failed");

  const result = Array.isArray(data?.data?.extract_result)
    ? data.data.extract_result[0]
    : undefined;
  const state = result?.state;
  if (state === "done") {
    const zipUrl = result?.full_zip_url;
    if (typeof zipUrl !== "string" || !zipUrl.trim()) {
      await deleteDocumentParseJob(job.id);
      return {
        status: "failed",
        error: "Mineru did not return result ZIP URL",
      };
    }

    const markdown = await downloadMineruZipMarkdown(zipUrl);
    await deleteDocumentParseJob(job.id);
    return { status: "completed", markdown };
  }

  if (state === "failed") {
    await deleteDocumentParseJob(job.id);
    return {
      status: "failed",
      error: result?.err_msg || "Mineru job failed",
    };
  }

  return { status: "pending" };
}

async function downloadMarkdown(url: string): Promise<string> {
  const { response, text } = await safeFetchText(
    url,
    { method: "GET" },
    {
      policy: getSafeUrlPolicy("docs"),
      timeoutMs: 30_000,
      maxResponseBytes: 20 * 1024 * 1024,
    },
  );
  if (!response.ok) {
    throw createUpstreamError(
      `Mineru Markdown download failed with status ${response.status}`,
      response.status,
    );
  }
  return text;
}

export function extractMarkdownFromMineruZip(arrayBuffer: ArrayBuffer): string {
  const zipBytes = new Uint8Array(arrayBuffer);
  let entryCount = 0;
  let totalDecompressedBytes = 0;
  const files = unzipSync(zipBytes, {
    filter(file) {
      entryCount += 1;
      if (entryCount > DOCUMENT_LIMITS.maxMineruZipEntries) {
        throw new Error("Mineru result ZIP contains too many files");
      }

      totalDecompressedBytes += file.originalSize;
      if (
        totalDecompressedBytes > DOCUMENT_LIMITS.maxMineruZipDecompressedBytes
      ) {
        throw new Error("Mineru result ZIP expands to too much data");
      }

      if (
        file.originalSize >
        DOCUMENT_LIMITS.maxMineruZipCompressionRatio * Math.max(1, file.size)
      ) {
        throw new Error("Mineru result ZIP compression ratio is too high");
      }

      if (
        MINERU_FULL_MARKDOWN_PATH_RE.test(file.name) &&
        file.originalSize > DOCUMENT_LIMITS.maxMineruFullMarkdownBytes
      ) {
        throw new Error("Mineru result markdown is too large");
      }

      return MINERU_FULL_MARKDOWN_PATH_RE.test(file.name);
    },
  });
  const entry = Object.entries(files).find(([name]) =>
    MINERU_FULL_MARKDOWN_PATH_RE.test(name),
  );
  if (!entry) {
    throw new Error("Mineru result ZIP did not contain full.md");
  }
  const markdown = strFromU8(entry[1]);
  if (markdown.length > DOCUMENT_LIMITS.maxMineruFullMarkdownChars) {
    throw new Error("Mineru result markdown is too large");
  }
  return markdown;
}

async function downloadMineruZipMarkdown(url: string): Promise<string> {
  const { response, arrayBuffer } = await safeFetchArrayBuffer(
    url,
    { method: "GET" },
    {
      policy: getSafeUrlPolicy("docs"),
      timeoutMs: 30_000,
      maxResponseBytes: 50 * 1024 * 1024,
    },
  );
  if (!response.ok) {
    throw createUpstreamError(
      `Mineru result ZIP download failed with status ${response.status}`,
      response.status,
    );
  }
  return extractMarkdownFromMineruZip(arrayBuffer);
}

export function clearDocumentParseJobs(): void {
  memoryJobStore.clear();
  configuredJobStore?.clear?.();
  configuredJobStore = null;
}
