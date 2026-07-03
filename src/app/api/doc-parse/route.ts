import { NextRequest, NextResponse } from "next/server";
import { API_INPUT_LIMITS, DOCUMENT_LIMITS } from "@/config/limits";
import {
  assertRequestContentLengthUnderLimit,
  createApiErrorResponse,
} from "@/lib/api/middleware";
import { DocumentParseSchema } from "@/lib/api/schemas";
import { getUploadBlobValidationError } from "@/lib/api/uploads";
import { BYOK_CONTEXTS } from "@/lib/byok/shared";
import { decryptSecretEnvelope } from "@/lib/byok/server";
import { getDefaultLlamaParseApiKey } from "@/lib/defaultConfig/server";
import { safeServerLogError } from "@/lib/utils/safeServerLog";
import { createDocumentParseJob } from "../../../lib/api/docParseJobs";

export async function POST(request: NextRequest) {
  try {
    assertRequestContentLengthUnderLimit(
      request,
      DOCUMENT_LIMITS.maxParseFileBytes +
        API_INPUT_LIMITS.maxMultipartOverheadBytes,
    );

    const formData = await request.formData();
    const apiKeySecretValue = formData.get("apiKeySecret");
    const { file, apiKeySecret, useDefault } = DocumentParseSchema.parse({
      file: formData.get("file"),
      apiKeySecret:
        typeof apiKeySecretValue === "string"
          ? JSON.parse(apiKeySecretValue)
          : undefined,
      apiKey: formData.get("apiKey") || undefined,
      useDefault: formData.get("useDefault") === "true",
    });
    const apiKey = useDefault
      ? getDefaultLlamaParseApiKey()
      : apiKeySecret
        ? await decryptSecretEnvelope(apiKeySecret, BYOK_CONTEXTS.llamaParse)
        : "";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Document parse API key is required" },
        { status: 400 },
      );
    }

    const fileError = getUploadBlobValidationError(file, {
      label: "Document file",
      maxBytes: DOCUMENT_LIMITS.maxParseFileBytes,
    });
    if (fileError) {
      return NextResponse.json(
        { error: fileError },
        {
          status: fileError.includes("too large") ? 413 : 400,
        },
      );
    }

    const credential = useDefault
      ? ({ kind: "default" } as const)
      : ({ kind: "encrypted", apiKeySecret: apiKeySecret! } as const);
    const job = await createDocumentParseJob(file, { apiKey, credential });
    return NextResponse.json(
      { jobId: job.id, status: "pending" },
      { status: 202 },
    );
  } catch (error) {
    safeServerLogError("Document parse error:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return createApiErrorResponse(error, "File and API key are required");
    }
    if (error instanceof Error && "statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: Number(error.statusCode) || 500 },
      );
    }
    return createApiErrorResponse(error, "Document parsing failed");
  }
}
