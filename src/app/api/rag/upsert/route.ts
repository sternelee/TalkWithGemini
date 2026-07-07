import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { RAGUpsertSchema } from "@/lib/api/schemas";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import { BYOK_CONTEXTS } from "@/lib/byok/shared";
import { decryptSecretEnvelope } from "@/lib/byok/server";
import { getDefaultRagRuntimeConfig } from "@/lib/defaultConfig/server";
import { resolveRagNamespace } from "../../../../lib/api/ragNamespace";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

export async function POST(request: NextRequest) {
  try {
    const body = RAGUpsertSchema.parse(await readJsonRequestBody(request));
    const { items, namespace = "", url, tokenSecret, useDefault } = body;
    const defaultRag = useDefault ? getDefaultRagRuntimeConfig() : null;
    const effectiveUrl = defaultRag?.url || url || "";
    const resolvedNamespace = resolveRagNamespace({
      useDefault: Boolean(defaultRag),
      requestedNamespace: namespace,
      defaultNamespace: defaultRag?.namespace,
    });
    if (!resolvedNamespace.ok) {
      return NextResponse.json(
        { error: resolvedNamespace.error },
        { status: 400 },
      );
    }
    const effectiveNamespace = resolvedNamespace.namespace;
    const token =
      defaultRag?.token ||
      (tokenSecret
        ? await decryptSecretEnvelope(tokenSecret, BYOK_CONTEXTS.ragToken)
        : "");

    if (!effectiveUrl || !token) {
      return NextResponse.json(
        { error: "RAG URL and token are required" },
        { status: 400 },
      );
    }

    const endpoint = new URL(
      `upsert-data${effectiveNamespace ? `/${encodeURIComponent(effectiveNamespace)}` : ""}`,
      `${effectiveUrl.replace(/\/+$/, "")}/`,
    ).toString();

    const { response, data } = await safeFetchJson<any>(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(items),
      },
      {
        policy: getSafeUrlPolicy("rag"),
        timeoutMs: 30_000,
        maxResponseBytes: 5 * 1024 * 1024,
      },
    );

    if (!response.ok || data.error) {
      return NextResponse.json(
        { error: "RAG upstream upsert failed" },
        { status: response.ok ? 502 : response.status },
      );
    }

    const success = data.result === "Success";

    return NextResponse.json({ success });
  } catch (error) {
    safeServerLogError("RAG upsert error:", error);
    return createApiErrorResponse(error, "RAG upsert failed");
  }
}
