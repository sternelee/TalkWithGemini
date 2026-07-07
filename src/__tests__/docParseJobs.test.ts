import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";

const safeFetchJsonMock = vi.hoisted(() => vi.fn());
const safeFetchTextMock = vi.hoisted(() => vi.fn());
const safeFetchArrayBufferMock = vi.hoisted(() => vi.fn());
const safeFetchSharedStoreJsonMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/config/limits", async () => vi.importActual("../config/limits"));
vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);
vi.mock("@/lib/api/schemas", async () => vi.importActual("../lib/api/schemas"));
vi.mock("@/lib/api/uploads", async () => vi.importActual("../lib/api/uploads"));
vi.mock("@/lib/byok/shared", async () => vi.importActual("../lib/byok/shared"));
vi.mock("@/lib/byok/server", async () => vi.importActual("../lib/byok/server"));
vi.mock("@/lib/defaultConfig/server", async () =>
  vi.importActual("../lib/defaultConfig/server"),
);
vi.mock("@/lib/security/deployment", async () =>
  vi.importActual("../lib/security/deployment"),
);
vi.mock("@/lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);
vi.mock("@/lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
}));
vi.mock("@/lib/security/safeFetch", () => ({
  safeFetchJson: safeFetchJsonMock,
  safeFetchText: safeFetchTextMock,
  safeFetchArrayBuffer: safeFetchArrayBufferMock,
}));
vi.mock("../lib/security/sharedStoreFetch", () => ({
  safeFetchSharedStoreJson: safeFetchSharedStoreJsonMock,
}));

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(fileName: string, text: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(fileName);
  const dataBytes = encoder.encode(text);
  const checksum = crc32(dataBytes);
  const localHeaderSize = 30 + nameBytes.byteLength;
  const centralOffset = localHeaderSize + dataBytes.byteLength;
  const centralSize = 46 + nameBytes.byteLength;
  const totalSize = centralOffset + centralSize + 22;
  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const writeUint16 = (value: number) => {
    view.setUint16(offset, value, true);
    offset += 2;
  };
  const writeUint32 = (value: number) => {
    view.setUint32(offset, value, true);
    offset += 4;
  };
  const writeBytes = (value: Uint8Array) => {
    bytes.set(value, offset);
    offset += value.byteLength;
  };

  writeUint32(0x04034b50);
  writeUint16(20);
  writeUint16(0);
  writeUint16(0);
  writeUint16(0);
  writeUint16(0);
  writeUint32(checksum);
  writeUint32(dataBytes.byteLength);
  writeUint32(dataBytes.byteLength);
  writeUint16(nameBytes.byteLength);
  writeUint16(0);
  writeBytes(nameBytes);
  writeBytes(dataBytes);

  writeUint32(0x02014b50);
  writeUint16(20);
  writeUint16(20);
  writeUint16(0);
  writeUint16(0);
  writeUint16(0);
  writeUint16(0);
  writeUint32(checksum);
  writeUint32(dataBytes.byteLength);
  writeUint32(dataBytes.byteLength);
  writeUint16(nameBytes.byteLength);
  writeUint16(0);
  writeUint16(0);
  writeUint16(0);
  writeUint16(0);
  writeUint32(0);
  writeUint32(0);
  writeBytes(nameBytes);

  writeUint32(0x06054b50);
  writeUint16(0);
  writeUint16(0);
  writeUint16(1);
  writeUint16(1);
  writeUint32(centralSize);
  writeUint32(centralOffset);
  writeUint16(0);

  return bytes.buffer;
}

function createZipWithManyEntries(entryCount: number): ArrayBuffer {
  const entries: Record<string, Uint8Array> = {
    "full.md": strToU8("markdown"),
  };
  for (let index = 0; index < entryCount; index += 1) {
    entries[`extra-${index}.txt`] = strToU8("");
  }
  return zipSync(entries).buffer;
}

function makeDocumentParseRequest(formData: FormData): Request {
  return new Request("https://neo.test/api/doc-parse", {
    method: "POST",
    headers: {
      "content-length": "2048",
    },
    body: formData,
  });
}

function makeJobRequest(
  jobId: string,
  jobSecret: string | undefined,
  init: RequestInit = {},
): Request {
  return new Request(`https://neo.test/api/doc-parse/jobs/${jobId}`, {
    ...init,
    headers: {
      ...(jobSecret ? { "x-doc-parse-job-secret": jobSecret } : {}),
      ...init.headers,
    },
  });
}

describe("document parse jobs", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    safeFetchJsonMock.mockReset();
    safeFetchTextMock.mockReset();
    safeFetchArrayBufferMock.mockReset();
    safeFetchSharedStoreJsonMock.mockReset();
    const { clearDocumentParseJobs } = await import("../lib/api/docParseJobs");
    clearDocumentParseJobs();
  });

  it("starts a parse job and polls it through the job endpoint", async () => {
    vi.stubEnv("DEFAULT_LLAMA_PARSE_API_KEY", "llama-secret");
    safeFetchJsonMock
      .mockResolvedValueOnce({
        response: new Response(null, { status: 200 }),
        data: { id: "upstream-job" },
      })
      .mockResolvedValueOnce({
        response: new Response(null, { status: 200 }),
        data: {
          job: { status: "COMPLETED" },
          markdown: { pages: [{ markdown: "hello" }, { markdown: "world" }] },
        },
      });

    const formData = new FormData();
    formData.set(
      "file",
      new File(["hello"], "doc.txt", { type: "text/plain" }),
    );
    formData.set("useDefault", "true");
    formData.set("provider", "llamaParse");

    const { POST } = await import("../app/api/doc-parse/route");
    const startResponse = await POST(makeDocumentParseRequest(formData) as any);
    const started = await startResponse.json();

    expect(startResponse.status).toBe(202);
    expect(started).toMatchObject({ status: "pending" });
    expect(started.jobId).toEqual(expect.any(String));
    expect(started.jobSecret).toEqual(expect.any(String));

    const { getDocumentParseJob } = await import("../lib/api/docParseJobs");
    const storedJob = await getDocumentParseJob(started.jobId);
    expect(storedJob).toMatchObject({
      credential: { kind: "default" },
    });
    expect(storedJob).not.toHaveProperty("apiKey");

    const { GET } = await import("../app/api/doc-parse/jobs/[id]/route");
    const statusResponse = await GET(
      makeJobRequest(started.jobId, started.jobSecret) as any,
      { params: Promise.resolve({ id: started.jobId }) },
    );

    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual({
      status: "completed",
      markdown: "hello\n\nworld",
    });
  });

  it("requires a shared document job store before uploading in hosted mode", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("DEFAULT_LLAMA_PARSE_API_KEY", "llama-secret");

    const { createDocumentParseJob } = await import("../lib/api/docParseJobs");

    await expect(
      createDocumentParseJob(
        new File(["hello"], "doc.txt", { type: "text/plain" }),
        {
          provider: "llamaParse",
          apiKey: "llama-secret",
          credential: { kind: "default" },
        },
      ),
    ).rejects.toThrow(/DOCUMENT_PARSE_JOB_STORE=upstash/i);
    expect(safeFetchJsonMock).not.toHaveBeenCalled();
  });

  it("uses the safe outbound wrapper for hosted shared document job stores", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("DOCUMENT_PARSE_JOB_STORE", "upstash");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis-secret");
    vi.stubEnv("DEFAULT_LLAMA_PARSE_API_KEY", "llama-secret");
    safeFetchJsonMock.mockResolvedValueOnce({
      response: new Response(null, { status: 200 }),
      data: { id: "upstream-job" },
    });
    safeFetchSharedStoreJsonMock.mockResolvedValueOnce({
      response: new Response(null, { status: 200 }),
      data: { result: "OK" },
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const { createDocumentParseJob } = await import("../lib/api/docParseJobs");
    await createDocumentParseJob(
      new File(["hello"], "doc.txt", { type: "text/plain" }),
      {
        provider: "llamaParse",
        apiKey: "llama-secret",
        credential: { kind: "default" },
      },
    );

    expect(safeFetchSharedStoreJsonMock).toHaveBeenCalledWith(
      "https://redis.example/set",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects multipart document uploads without a trustworthy content length before parsing", async () => {
    vi.stubEnv("DEFAULT_LLAMA_PARSE_API_KEY", "llama-secret");
    const formData = new FormData();
    formData.set(
      "file",
      new File(["hello"], "doc.txt", { type: "text/plain" }),
    );
    formData.set("useDefault", "true");
    formData.set("provider", "llamaParse");

    const { POST } = await import("../app/api/doc-parse/route");
    const response = await POST(
      new Request("https://neo.test/api/doc-parse", {
        method: "POST",
        body: formData,
      }) as any,
    );

    expect(response.status).toBe(411);
    expect(await response.json()).toMatchObject({
      code: "LENGTH_REQUIRED",
    });
    expect(safeFetchJsonMock).not.toHaveBeenCalled();
  });

  it("rejects Mineru result ZIP files with too many entries", async () => {
    const { extractMarkdownFromMineruZip } =
      await import("../lib/api/docParseJobs");

    expect(() =>
      extractMarkdownFromMineruZip(createZipWithManyEntries(250)),
    ).toThrow(/too many files/i);
  });

  it("does not fall back to memory when the hosted document job store fails", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    safeFetchJsonMock.mockResolvedValueOnce({
      response: new Response(null, { status: 200 }),
      data: { id: "upstream-job" },
    });

    const { createDocumentParseJob, setDocumentParseJobStoreForTesting } =
      await import("../lib/api/docParseJobs");
    setDocumentParseJobStoreForTesting({
      create: async () => {
        throw new Error("shared job store unavailable");
      },
      get: async () => undefined,
      delete: async () => false,
    });

    await expect(
      createDocumentParseJob(
        new File(["hello"], "doc.txt", { type: "text/plain" }),
        {
          provider: "llamaParse",
          apiKey: "llama-secret",
          credential: { kind: "default" },
        },
      ),
    ).rejects.toThrow("shared job store unavailable");
  });

  it("can cancel a pending parse job", async () => {
    vi.stubEnv("DEFAULT_LLAMA_PARSE_API_KEY", "llama-secret");
    safeFetchJsonMock.mockResolvedValueOnce({
      response: new Response(null, { status: 200 }),
      data: { id: "upstream-job" },
    });

    const formData = new FormData();
    formData.set(
      "file",
      new File(["hello"], "doc.txt", { type: "text/plain" }),
    );
    formData.set("useDefault", "true");
    formData.set("provider", "llamaParse");

    const { POST } = await import("../app/api/doc-parse/route");
    const startResponse = await POST(makeDocumentParseRequest(formData) as any);
    const started = await startResponse.json();
    const { DELETE, GET } =
      await import("../app/api/doc-parse/jobs/[id]/route");

    const deleteResponse = await DELETE(
      makeJobRequest(started.jobId, started.jobSecret, {
        method: "DELETE",
      }) as any,
      { params: Promise.resolve({ id: started.jobId }) },
    );
    expect(await deleteResponse.json()).toEqual({ ok: true, deleted: true });

    const getResponse = await GET(
      makeJobRequest(started.jobId, started.jobSecret) as any,
      { params: Promise.resolve({ id: started.jobId }) },
    );
    expect(getResponse.status).toBe(404);
  });

  it("requires the job secret to poll or cancel a parse job", async () => {
    vi.stubEnv("DEFAULT_LLAMA_PARSE_API_KEY", "llama-secret");
    safeFetchJsonMock.mockResolvedValueOnce({
      response: new Response(null, { status: 200 }),
      data: { id: "upstream-job" },
    });

    const formData = new FormData();
    formData.set(
      "file",
      new File(["hello"], "doc.txt", { type: "text/plain" }),
    );
    formData.set("useDefault", "true");
    formData.set("provider", "llamaParse");

    const { POST } = await import("../app/api/doc-parse/route");
    const startResponse = await POST(makeDocumentParseRequest(formData) as any);
    const started = await startResponse.json();
    const { DELETE, GET } =
      await import("../app/api/doc-parse/jobs/[id]/route");

    const unauthorizedStatus = await GET(
      makeJobRequest(started.jobId, undefined) as any,
      { params: Promise.resolve({ id: started.jobId }) },
    );
    const unauthorizedDelete = await DELETE(
      makeJobRequest(started.jobId, undefined, { method: "DELETE" }) as any,
      { params: Promise.resolve({ id: started.jobId }) },
    );

    expect(unauthorizedStatus.status).toBe(403);
    expect(await unauthorizedStatus.json()).toMatchObject({
      code: "DOCUMENT_JOB_FORBIDDEN",
    });
    expect(unauthorizedDelete.status).toBe(403);
    expect(await unauthorizedDelete.json()).toMatchObject({
      code: "DOCUMENT_JOB_FORBIDDEN",
    });
  });

  it("does not accept document parse job secrets from query parameters", async () => {
    vi.stubEnv("DEFAULT_LLAMA_PARSE_API_KEY", "llama-secret");
    safeFetchJsonMock.mockResolvedValueOnce({
      response: new Response(null, { status: 200 }),
      data: { id: "upstream-job" },
    });

    const formData = new FormData();
    formData.set(
      "file",
      new File(["hello"], "doc.txt", { type: "text/plain" }),
    );
    formData.set("useDefault", "true");
    formData.set("provider", "llamaParse");

    const { POST } = await import("../app/api/doc-parse/route");
    const startResponse = await POST(makeDocumentParseRequest(formData) as any);
    const started = await startResponse.json();
    const { GET } = await import("../app/api/doc-parse/jobs/[id]/route");

    const response = await GET(
      new Request(
        `https://neo.test/api/doc-parse/jobs/${started.jobId}?jobSecret=${started.jobSecret}`,
      ) as any,
      { params: Promise.resolve({ id: started.jobId }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "DOCUMENT_JOB_FORBIDDEN",
    });
  });

  it("returns a sanitized API error when cancelling a parse job fails", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    const { setDocumentParseJobStoreForTesting } =
      await import("../lib/api/docParseJobs");
    setDocumentParseJobStoreForTesting({
      create: async () => {
        throw new Error("unused");
      },
      get: async () => ({
        id: "job-1",
        secret: "job-secret",
        provider: "llamaParse",
        mode: "llama-parse",
        upstreamJobId: "upstream-job",
        credential: { kind: "none" },
        createdAt: Date.now(),
      }),
      delete: async () => {
        throw new Error("redis token=secret unavailable");
      },
    });

    const { DELETE } = await import("../app/api/doc-parse/jobs/[id]/route");
    const response = await DELETE(
      new Request("https://neo.test/api/doc-parse/jobs/job-1", {
        method: "DELETE",
        headers: { "x-doc-parse-job-secret": "job-secret" },
      }) as any,
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Document parse job cancellation failed",
      code: "INTERNAL_ERROR",
      statusCode: 500,
    });
  });

  it("parses files through Mineru agent mode without a token", async () => {
    safeFetchJsonMock
      .mockResolvedValueOnce({
        response: new Response(null, { status: 200 }),
        data: {
          code: 0,
          data: {
            task_id: "mineru-agent-task",
            file_url: "https://oss-mineru.openxlab.org.cn/upload.pdf",
          },
        },
      })
      .mockResolvedValueOnce({
        response: new Response(null, { status: 200 }),
        data: {
          code: 0,
          data: {
            state: "done",
            markdown_url:
              "https://cdn-mineru.openxlab.org.cn/mineru-agent-task/full.md",
          },
        },
      });
    safeFetchTextMock
      .mockResolvedValueOnce({
        response: new Response(null, { status: 200 }),
        text: "",
        url: "https://oss-mineru.openxlab.org.cn/upload.pdf",
      })
      .mockResolvedValueOnce({
        response: new Response("agent markdown", { status: 200 }),
        text: "agent markdown",
        url: "https://cdn-mineru.openxlab.org.cn/mineru-agent-task/full.md",
      });

    const formData = new FormData();
    formData.set(
      "file",
      new File(["hello"], "doc.pdf", { type: "application/pdf" }),
    );
    formData.set("useDefault", "true");
    formData.set("provider", "mineru");

    const { POST } = await import("../app/api/doc-parse/route");
    const startResponse = await POST(makeDocumentParseRequest(formData) as any);
    const started = await startResponse.json();

    expect(startResponse.status).toBe(202);
    expect(started.jobSecret).toEqual(expect.any(String));
    expect(safeFetchJsonMock).toHaveBeenCalledWith(
      "https://mineru.net/api/v1/agent/parse/file",
      expect.objectContaining({
        method: "POST",
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
      expect.any(Object),
    );

    const { getDocumentParseJob } = await import("../lib/api/docParseJobs");
    await expect(getDocumentParseJob(started.jobId)).resolves.toMatchObject({
      provider: "mineru",
      upstreamJobId: "mineru-agent-task",
      credential: { kind: "default" },
    });

    const { GET } = await import("../app/api/doc-parse/jobs/[id]/route");
    const statusResponse = await GET(
      makeJobRequest(started.jobId, started.jobSecret) as any,
      { params: Promise.resolve({ id: started.jobId }) },
    );

    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual({
      status: "completed",
      markdown: "agent markdown",
    });
  });

  it("parses files through Mineru precise mode when a default token is configured", async () => {
    vi.stubEnv("DEFAULT_MINERU_API_TOKEN", "mineru-secret");
    safeFetchJsonMock
      .mockResolvedValueOnce({
        response: new Response(null, { status: 200 }),
        data: {
          code: 0,
          data: {
            batch_id: "mineru-batch",
            file_urls: ["https://mineru.oss-cn-shanghai.aliyuncs.com/doc.pdf"],
          },
        },
      })
      .mockResolvedValueOnce({
        response: new Response(null, { status: 200 }),
        data: {
          code: 0,
          data: {
            extract_result: [
              {
                state: "done",
                full_zip_url:
                  "https://cdn-mineru.openxlab.org.cn/mineru-batch/result.zip",
              },
            ],
          },
        },
      });
    safeFetchTextMock.mockResolvedValueOnce({
      response: new Response(null, { status: 200 }),
      text: "",
      url: "https://mineru.oss-cn-shanghai.aliyuncs.com/doc.pdf",
    });
    safeFetchArrayBufferMock.mockResolvedValueOnce({
      response: new Response(null, { status: 200 }),
      arrayBuffer: createStoredZip("full.md", "precise markdown"),
      url: "https://cdn-mineru.openxlab.org.cn/mineru-batch/result.zip",
    });

    const formData = new FormData();
    formData.set(
      "file",
      new File(["hello"], "doc.pdf", { type: "application/pdf" }),
    );
    formData.set("useDefault", "true");
    formData.set("provider", "mineru");

    const { POST } = await import("../app/api/doc-parse/route");
    const startResponse = await POST(makeDocumentParseRequest(formData) as any);
    const started = await startResponse.json();
    expect(started.jobSecret).toEqual(expect.any(String));

    expect(startResponse.status).toBe(202);
    expect(safeFetchJsonMock).toHaveBeenCalledWith(
      "https://mineru.net/api/v4/file-urls/batch",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mineru-secret",
        }),
        body: expect.stringContaining('"model_version":"vlm"'),
      }),
      expect.any(Object),
    );

    const { GET } = await import("../app/api/doc-parse/jobs/[id]/route");
    const statusResponse = await GET(
      makeJobRequest(started.jobId, started.jobSecret) as any,
      { params: Promise.resolve({ id: started.jobId }) },
    );

    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual({
      status: "completed",
      markdown: "precise markdown",
    });
  });

  it("rejects oversized Mineru no-token uploads before calling Mineru", async () => {
    const formData = new FormData();
    formData.set(
      "file",
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", {
        type: "application/pdf",
      }),
    );
    formData.set("useDefault", "true");
    formData.set("provider", "mineru");

    const { POST } = await import("../app/api/doc-parse/route");
    const response = await POST(makeDocumentParseRequest(formData) as any);

    expect(response.status).toBe(413);
    expect(safeFetchJsonMock).not.toHaveBeenCalled();
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });
});
