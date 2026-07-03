import { describe, expect, it } from "vitest";
import {
  getResponseErrorMessage,
  readJsonResponse,
  readJsonResponseOrThrow,
} from "../lib/api/client";

describe("client API response helpers", () => {
  it("parses JSON responses and returns null for empty or malformed bodies", async () => {
    await expect(
      readJsonResponse<{ ok: boolean }>(Response.json({ ok: true })),
    ).resolves.toEqual({ ok: true });
    await expect(readJsonResponse(new Response(""))).resolves.toBeNull();
    await expect(
      readJsonResponse(new Response("<html>Proxy error</html>")),
    ).resolves.toBeNull();
  });

  it("throws a stable fallback when successful response JSON is malformed", async () => {
    await expect(
      readJsonResponseOrThrow(new Response("<html></html>"), "Bad response"),
    ).rejects.toThrow("Bad response");
  });

  it("extracts public error messages with a stable fallback", async () => {
    await expect(
      getResponseErrorMessage(Response.json({ error: "Nope" }), "Fallback"),
    ).resolves.toBe("Nope");
    await expect(
      getResponseErrorMessage(
        Response.json({ error: { message: "Nested nope" } }),
        "Fallback",
      ),
    ).resolves.toBe("Nested nope");
    await expect(
      getResponseErrorMessage(new Response("<html></html>"), "Fallback"),
    ).resolves.toBe("Fallback");
  });
});
