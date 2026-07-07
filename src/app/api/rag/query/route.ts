import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { RAGQuerySchema } from "@/lib/api/schemas";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import { normalizeSearchSources } from "@/lib/search/results";
import { BYOK_CONTEXTS } from "@/lib/byok/shared";
import { decryptSecretEnvelope } from "@/lib/byok/server";
import { getDefaultRagRuntimeConfig } from "@/lib/defaultConfig/server";
import { resolveRagNamespace } from "../../../../lib/api/ragNamespace";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

export async function POST(request: NextRequest) {
  try {
    const body = RAGQuerySchema.parse(await readJsonRequestBody(request));
    const { text, namespace = "", url, tokenSecret, useDefault } = body;
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
    const topK = body.topK || defaultRag?.topK || 10;
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
      `query-data${effectiveNamespace ? `/${encodeURIComponent(effectiveNamespace)}` : ""}`,
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
        body: JSON.stringify([
          {
            data: text,
            topK: topK,
            includeMetadata: true,
            includeData: true,
          },
        ]),
      },
      {
        policy: getSafeUrlPolicy("rag"),
        timeoutMs: 30_000,
        maxResponseBytes: 5 * 1024 * 1024,
      },
    );

    if (!response.ok || data.error) {
      return NextResponse.json(
        { error: "RAG upstream query failed" },
        { status: response.ok ? 502 : response.status },
      );
    }

    const results = data.result || [];
    const sources = results.map((res: any) => ({
      title: `${res.metadata?.fileName || "Knowledge Result"} [Score: ${Number(res.score || 0).toFixed(2)}]`,
      url: res.metadata?.url || "#",
      content: res.data,
      metadata: {
        ...(res.metadata || {}),
        ...(effectiveNamespace && !res.metadata?.collectionId
          ? { collectionId: effectiveNamespace }
          : {}),
      },
    }));

    return NextResponse.json({
      sources: normalizeSearchSources(sources, {
        allowPlaceholderUrl: true,
        maxSources: topK,
      }),
    });
  } catch (error) {
    safeServerLogError("RAG query error:", error);
    return createApiErrorResponse(error, "RAG query failed");
  }
}
