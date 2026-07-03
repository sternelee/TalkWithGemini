import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  toPublicErrorPayload,
  ValidationError,
} from "../lib/errors";

describe("public error serialization", () => {
  it("keeps validation errors actionable", () => {
    expect(
      toPublicErrorPayload(new ValidationError("Missing model")),
    ).toMatchObject({
      error: "Missing model",
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });
  });

  it("keeps auth errors actionable", () => {
    expect(toPublicErrorPayload(new AuthenticationError())).toMatchObject({
      error: "API key not configured",
      code: "AUTH_ERROR",
      statusCode: 401,
    });
  });

  it("hides unknown internal error details", () => {
    expect(
      toPublicErrorPayload(
        new Error("upstream failed with token=secret-value"),
      ),
    ).toMatchObject({
      error: "An internal error occurred. Please try again.",
      code: "INTERNAL_ERROR",
      statusCode: 500,
    });
  });
});
