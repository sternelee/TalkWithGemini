import { NextRequest, NextResponse } from "next/server";
import {
  deleteDocumentParseJob,
  getDocumentParseJob,
  pollDocumentParseJob,
} from "../../../../../lib/api/docParseJobs";
import { createApiErrorResponse } from "@/lib/api/middleware";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const job = await getDocumentParseJob(id);
    if (!job) {
      return NextResponse.json(
        { error: "Document parse job was not found" },
        { status: 404 },
      );
    }

    const result = await pollDocumentParseJob(job);
    const status = result.status === "failed" ? 502 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    safeServerLogError("Document parse job status error:", error);
    return createApiErrorResponse(error, "Document parse job status failed");
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const deleted = await deleteDocumentParseJob(id);
  return NextResponse.json({ ok: true, deleted });
}
