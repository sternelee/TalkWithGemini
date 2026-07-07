import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { EncryptedSecretEnvelopeSchema } from "@/lib/api/schemas";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import { BYOK_CONTEXTS } from "@/lib/byok/shared";
import { decryptSecretEnvelope } from "@/lib/byok/server";
import { getDefaultRagRuntimeConfig } from "@/lib/defaultConfig/server";
import { resolveRagNamespace } from "../../../../lib/api/ragNamespace";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

const RAGDeleteSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(1_000),
    namespace: z.string().max(200).optional(),
    url: z.string().max(2_048).optional(),
    token: z.unknown().optional(),
    tokenSecret: EncryptedSecretEnvelopeSchema.optional(),
    useDefault: z.boolean().optional(),
  })
  .strict()
  .superRefine((request, ctx) => {
    if (typeof request.token === "string" && request.token.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["token"],
        message: "RAG token must be sent as an encrypted BYOK secret",
      });
    }
    if (!request.useDefault && (!request.url?.trim() || !request.tokenSecret)) {
      ctx.addIssue({
        code: "custom",
        path: ["tokenSecret"],
        message: "RAG URL and token are required",
      });
    }
  })
  .transform((request) => {
    const next = { ...request };
    delete next.token;
    return next;
  });

export async function POST(request: NextRequest) {
  try {
    const {
      ids,
      namespace = "",
      url,
      tokenSecret,
      useDefault,
    } = RAGDeleteSchema.parse(await readJsonRequestBody(request));
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
      `delete-data${effectiveNamespace ? `/${encodeURIComponent(effectiveNamespace)}` : ""}`,
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
        body: JSON.stringify(ids),
      },
      {
        policy: getSafeUrlPolicy("rag"),
        timeoutMs: 20_000,
        maxResponseBytes: 1024 * 1024,
      },
    );

    if (!response.ok || data.error) {
      return NextResponse.json(
        { error: "RAG upstream delete failed" },
        { status: response.ok ? 502 : response.status },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    safeServerLogError("RAG delete error:", error);
    return createApiErrorResponse(error, "RAG delete failed");
  }
}
