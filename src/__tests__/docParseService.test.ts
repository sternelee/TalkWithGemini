import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signedApiFetch: vi.fn(),
}));

vi.mock("../lib/api/client", async () => {
  const actual = await vi.importActual("../lib/api/client");
  return {
    ...actual,
    signedApiFetch: mocks.signedApiFetch,
  };
});

vi.mock("../lib/byok/client", () => ({
  encryptSecret: vi.fn(),
  fetchWithByokRetry: vi.fn((requestFactory) => requestFactory()),
}));

describe("document parse service", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mocks.signedApiFetch.mockReset();
  });

  it("cancels a pending parse job when the caller aborts", async () => {
    vi.useFakeTimers();
    mocks.signedApiFetch.mockResolvedValueOnce(
      Response.json(
        { jobId: "job-1", jobSecret: "job-secret", status: "pending" },
        { status: 202 },
      ),
    );
    mocks.signedApiFetch.mockResolvedValueOnce(
      Response.json({ ok: true, deleted: true }),
    );
    const controller = new AbortController();
    const { parseDocumentFile } =
      await import("../services/api/docParseService");

    const parsing = parseDocumentFile(
      new File(["pdf"], "doc.pdf", { type: "application/pdf" }),
      {
        provider: "mineru",
        useDefault: true,
        signal: controller.signal,
      },
    );
    await vi.waitFor(() =>
      expect(mocks.signedApiFetch).toHaveBeenCalledTimes(1),
    );

    controller.abort();

    await expect(parsing).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.signedApiFetch).toHaveBeenLastCalledWith(
      "/api/doc-parse/jobs/job-1",
      expect.objectContaining({
        method: "DELETE",
        headers: {
          "x-doc-parse-job-secret": "job-secret",
        },
      }),
    );
  });
});
