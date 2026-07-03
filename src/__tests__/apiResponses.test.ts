import { describe, expect, it } from "vitest";
import { ValidationError } from "../lib/errors";
import {
  createApiErrorPayload,
  createApiErrorResponse,
  createApiSuccessResponse,
} from "../lib/api/responses";

describe("API response helpers", () => {
  it("creates stable success responses", async () => {
    const response = createApiSuccessResponse({ ok: true }, { status: 201 });

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("creates stable error payloads and preserves retryAfter", async () => {
    const payload = createApiErrorPayload(
      new ValidationError("Invalid input", { field: "model" }),
      {
        retryAfter: 10,
      },
    );

    expect(payload).toEqual({
      error: "Invalid input",
      code: "VALIDATION_ERROR",
      statusCode: 400,
      details: { field: "model" },
      retryAfter: 10,
    });

    const response = createApiErrorResponse(new Error("token=secret"), {
      fallbackError: "Request failed",
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Request failed",
      code: "INTERNAL_ERROR",
      statusCode: 500,
    });
  });
});
