import { NextRequest, NextResponse } from "next/server";
import {
  API_INPUT_LIMITS,
  DOCUMENT_LIMITS,
  getRuntimeMaxAttachmentFileBytes,
} from "@/config/limits";
import {
  assertMultipartRequestContentLengthUnderLimit,
  createApiErrorResponse,
} from "@/lib/api/middleware";
import { DocumentParseSchema } from "@/lib/api/schemas";
import { getUploadBlobValidationError } from "@/lib/api/uploads";
import { BYOK_CONTEXTS } from "@/lib/byok/shared";
import { decryptSecretEnvelope } from "@/lib/byok/server";
import { getDefaultDocumentParseToken } from "@/lib/defaultConfig/server";
import { safeServerLogError } from "@/lib/utils/safeServerLog";
import { createDocumentParseJob } from "../../../lib/api/docParseJobs";

export async function POST(request: NextRequest) {
  try {
    const runtimeMaxFileBytes = getRuntimeMaxAttachmentFileBytes();
    assertMultipartRequestContentLengthUnderLimit(
      request,
      Math.min(DOCUMENT_LIMITS.maxParseFileBytes, runtimeMaxFileBytes) +
        API_INPUT_LIMITS.maxMultipartOverheadBytes,
    );

    const formData = await request.formData();
    const apiKeySecretValue = formData.get("apiKeySecret");
    const { file, provider, apiKeySecret, useDefault } =
      DocumentParseSchema.parse({
        file: formData.get("file"),
        provider: formData.get("provider") || undefined,
        apiKeySecret:
          typeof apiKeySecretValue === "string"
            ? JSON.parse(apiKeySecretValue)
            : undefined,
        apiKey: formData.get("apiKey") || undefined,
        apiToken: formData.get("apiToken") || undefined,
        useDefault: formData.get("useDefault") === "true",
      });
    const apiKey = useDefault
      ? getDefaultDocumentParseToken(provider)
      : apiKeySecret
        ? await decryptSecretEnvelope(
            apiKeySecret,
            provider === "mineru"
              ? BYOK_CONTEXTS.mineru
              : BYOK_CONTEXTS.llamaParse,
          )
        : "";

    if (provider === "llamaParse" && !apiKey) {
      return NextResponse.json(
        { error: "Document parse API key is required" },
        { status: 400 },
      );
    }

    const maxBytes =
      provider === "mineru" && !apiKey
        ? DOCUMENT_LIMITS.maxMineruAgentParseFileBytes
        : DOCUMENT_LIMITS.maxParseFileBytes;
    const fileError = getUploadBlobValidationError(file, {
      label: "Document file",
      maxBytes: Math.min(maxBytes, runtimeMaxFileBytes),
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
      : apiKeySecret
        ? ({ kind: "encrypted", provider, apiKeySecret } as const)
        : ({ kind: "none" } as const);
    const job = await createDocumentParseJob(file, {
      provider,
      apiKey,
      credential,
    });
    return NextResponse.json(
      { jobId: job.id, jobSecret: job.secret, status: "pending" },
      { status: 202 },
    );
  } catch (error) {
    safeServerLogError("Document parse error:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return createApiErrorResponse(error, "File and API key are required");
    }
    if (error instanceof Error && "statusCode" in error && !("code" in error)) {
      return NextResponse.json(
        { error: error.message },
        { status: Number(error.statusCode) || 500 },
      );
    }
    return createApiErrorResponse(error, "Document parsing failed");
  }
}
