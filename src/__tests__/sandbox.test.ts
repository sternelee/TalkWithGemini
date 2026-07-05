import { describe, expect, it } from "vitest";
import { BROWSER_SANDBOX_LIMITS } from "../config/limits";
import { createSandboxHtml, runInSandbox } from "../utils/sandbox";

describe("browser sandbox hardening", () => {
  it("binds iframe messages to a run id and parent origin", () => {
    const html = createSandboxHtml("run-123", "https://app.example");

    expect(html).toContain('const RUN_ID = "run-123"');
    expect(html).toContain('const PARENT_ORIGIN = "https://app.example"');
    expect(html).toContain("data.runId !== RUN_ID");
    expect(html).toContain("typeof data.code !== 'string'");
    expect(html).toContain("parent.postMessage({ runId: RUN_ID");
    expect(html).toContain("}, PARENT_ORIGIN)");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("frame-src 'none'");
  });

  it("runs user JavaScript in a terminable worker inside the sandbox", () => {
    const html = createSandboxHtml("run-123", "https://app.example");

    expect(html).toContain("worker-src blob:");
    expect(html).toContain("new Worker(workerUrl)");
    expect(html).toContain("worker.terminate()");
    expect(html).toContain("JavaScript execution timed out.");
    expect(html).toContain(
      "Network access is disabled in the browser sandbox.",
    );
    expect(html).toContain("fetch");
    expect(html).toContain("SharedWorker");
    expect(html).toContain("XMLHttpRequest");
  });

  it("rejects oversized JavaScript before touching the DOM", async () => {
    const result = await runInSandbox(
      "x".repeat(BROWSER_SANDBOX_LIMITS.maxCodeChars + 1),
    );

    expect(result).toContain("too large");
  });
});
