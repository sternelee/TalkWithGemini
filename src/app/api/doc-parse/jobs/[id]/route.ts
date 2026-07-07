import { NextRequest, NextResponse } from "next/server";
import {
  deleteDocumentParseJob,
  getDocumentParseJob,
  isDocumentParseJobSecretValid,
  pollDocumentParseJob,
} from "../../../../../lib/api/docParseJobs";
import { createApiErrorResponse } from "@/lib/api/middleware";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function getJobSecret(request: Request): string {
  return request.headers.get("x-doc-parse-job-secret") || "";
}

function forbiddenJobResponse() {
  return NextResponse.json(
    {
      error: "Document parse job secret is required",
      code: "DOCUMENT_JOB_FORBIDDEN",
      statusCode: 403,
    },
    { status: 403 },
  );
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const job = await getDocumentParseJob(id);
    if (!job) {
      return NextResponse.json(
        { error: "Document parse job was not found" },
        { status: 404 },
      );
    }
    if (!isDocumentParseJobSecretValid(job, getJobSecret(request))) {
      return forbiddenJobResponse();
    }

    const result = await pollDocumentParseJob(job);
    const status = result.status === "failed" ? 502 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    safeServerLogError("Document parse job status error:", error);
    return createApiErrorResponse(error, "Document parse job status failed");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const job = await getDocumentParseJob(id);
    if (!job) {
      return NextResponse.json({ ok: true, deleted: false });
    }
    if (!isDocumentParseJobSecretValid(job, getJobSecret(request))) {
      return forbiddenJobResponse();
    }
    const deleted = await deleteDocumentParseJob(id);
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    safeServerLogError("Document parse job cancellation error:", error);
    return createApiErrorResponse(error, {
      fallbackError: "Document parse job cancellation failed",
    });
  }
}
