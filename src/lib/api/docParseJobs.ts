import "server-only";

import { v7 as uuidv7 } from "uuid";
import type { EncryptedSecretEnvelope } from "@/lib/byok/shared";
import { BYOK_CONTEXTS } from "@/lib/byok/shared";
import { decryptSecretEnvelope } from "@/lib/byok/server";
import { getDefaultLlamaParseApiKey } from "@/lib/defaultConfig/server";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import { getDeploymentMode } from "../security/deployment";

const LLAMA_PARSE_URL = "https://api.cloud.llamaindex.ai/api/v2/parse";
const JOB_TTL_MS = 10 * 60 * 1000;

export type DocumentParseJobStatus = "pending" | "completed" | "failed";

export interface DocumentParseJob {
  id: string;
  upstreamJobId: string;
  credential:
    | { kind: "default" }
    | { kind: "encrypted"; apiKeySecret: EncryptedSecretEnvelope };
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
    const response = await fetch(this.endpoint("set"), {
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
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        `Document job store failed with status ${response.status}`,
      );
    }
  }

  async get(id: string): Promise<DocumentParseJob | undefined> {
    const response = await fetch(
      this.endpoint(`get/${encodeURIComponent(this.key(id))}`),
      {
        headers: { Authorization: `Bearer ${this.token}` },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(
        `Document job store failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as { result?: string | null };
    if (!data.result) return undefined;
    return JSON.parse(data.result) as DocumentParseJob;
  }

  async delete(id: string): Promise<boolean> {
    const response = await fetch(
      this.endpoint(`del/${encodeURIComponent(this.key(id))}`),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}` },
        cache: "no-store",
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

async function resolveJobApiKey(job: DocumentParseJob): Promise<string> {
  if (job.credential.kind === "default") {
    return getDefaultLlamaParseApiKey();
  }
  return decryptSecretEnvelope(
    job.credential.apiKeySecret,
    BYOK_CONTEXTS.llamaParse,
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
  apiKey: string;
  credential:
    | { kind: "default" }
    | { kind: "encrypted"; apiKeySecret: EncryptedSecretEnvelope };
}

export async function createDocumentParseJob(
  file: File,
  options: CreateDocumentParseJobOptions,
): Promise<DocumentParseJob> {
  await getDocumentParseJobStore().expire?.();

  const apiKey = options.apiKey.trim();
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
    const error = new Error(
      `LlamaParse upload failed with status ${response.status}`,
    );
    (error as Error & { statusCode?: number }).statusCode = response.status;
    throw error;
  }

  if (typeof data?.id !== "string" || !data.id.trim()) {
    throw new Error("LlamaParse upload did not return a job id");
  }

  const job = {
    id: uuidv7(),
    upstreamJobId: data.id,
    credential: options.credential,
    createdAt: Date.now(),
  };
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
  const apiKey = await resolveJobApiKey(job);
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

export function clearDocumentParseJobs(): void {
  memoryJobStore.clear();
  configuredJobStore?.clear?.();
  configuredJobStore = null;
}
