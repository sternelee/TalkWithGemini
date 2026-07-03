import { afterEach, describe, expect, it, vi } from "vitest";

const safeFetchJsonMock = vi.hoisted(() => vi.fn());

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
}));

describe("document parse jobs", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    safeFetchJsonMock.mockReset();
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

    const { POST } = await import("../app/api/doc-parse/route");
    const startResponse = await POST(
      new Request("https://neo.test/api/doc-parse", {
        method: "POST",
        body: formData,
      }) as any,
    );
    const started = await startResponse.json();

    expect(startResponse.status).toBe(202);
    expect(started).toMatchObject({ status: "pending" });
    expect(started.jobId).toEqual(expect.any(String));

    const { getDocumentParseJob } = await import("../lib/api/docParseJobs");
    const storedJob = await getDocumentParseJob(started.jobId);
    expect(storedJob).toMatchObject({
      credential: { kind: "default" },
    });
    expect(storedJob).not.toHaveProperty("apiKey");

    const { GET } = await import("../app/api/doc-parse/jobs/[id]/route");
    const statusResponse = await GET(
      new Request(
        `https://neo.test/api/doc-parse/jobs/${started.jobId}`,
      ) as any,
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
          apiKey: "llama-secret",
          credential: { kind: "default" },
        },
      ),
    ).rejects.toThrow(/DOCUMENT_PARSE_JOB_STORE=upstash/i);
    expect(safeFetchJsonMock).not.toHaveBeenCalled();
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

    const { POST } = await import("../app/api/doc-parse/route");
    const startResponse = await POST(
      new Request("https://neo.test/api/doc-parse", {
        method: "POST",
        body: formData,
      }) as any,
    );
    const started = await startResponse.json();
    const { DELETE, GET } =
      await import("../app/api/doc-parse/jobs/[id]/route");

    const deleteResponse = await DELETE(
      new Request(`https://neo.test/api/doc-parse/jobs/${started.jobId}`, {
        method: "DELETE",
      }) as any,
      { params: Promise.resolve({ id: started.jobId }) },
    );
    expect(await deleteResponse.json()).toEqual({ ok: true, deleted: true });

    const getResponse = await GET(
      new Request(
        `https://neo.test/api/doc-parse/jobs/${started.jobId}`,
      ) as any,
      { params: Promise.resolve({ id: started.jobId }) },
    );
    expect(getResponse.status).toBe(404);
  });
});
