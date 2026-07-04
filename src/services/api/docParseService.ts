import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
} from "../../lib/api/client";
import { encryptSecret, fetchWithByokRetry } from "../../lib/byok/client";
import { BYOK_CONTEXTS } from "../../lib/byok/shared";
import { logDevError } from "../../lib/utils/devLogger";
import type { DocumentParseProvider } from "../../types";

type DocumentParseStartResponse =
  { markdown?: string } | { jobId?: string; status?: "pending" };

type DocumentParseJobResponse =
  | { status: "pending" }
  | { status: "completed"; markdown?: string }
  | { status: "failed"; error?: string };

const DOC_PARSE_POLL_INTERVAL_MS = 2_000;
const DOC_PARSE_MAX_POLLS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function pollDocumentParseJob(jobId: string): Promise<string> {
  for (let attempt = 0; attempt < DOC_PARSE_MAX_POLLS; attempt += 1) {
    await sleep(DOC_PARSE_POLL_INTERVAL_MS);

    const response = await fetch(
      `/api/doc-parse/jobs/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Document parsing failed"),
      );
    }

    const data = await readJsonResponseOrThrow<DocumentParseJobResponse>(
      response,
      "Document parsing failed",
    );

    if (data.status === "completed") return data.markdown || "";
    if (data.status === "failed") {
      throw new Error(data.error || "Document parsing failed");
    }
  }

  throw new Error("Document parsing timed out. Please try again later.");
}

function getDocumentParseSecretContext(
  provider: DocumentParseProvider,
): string {
  return provider === "mineru"
    ? BYOK_CONTEXTS.mineru
    : BYOK_CONTEXTS.llamaParse;
}

export async function parseDocumentFile(
  file: File,
  options: {
    provider: DocumentParseProvider;
    apiKey?: string;
    useDefault?: boolean;
  },
): Promise<string> {
  const { provider, apiKey, useDefault = false } = options;
  if (provider === "llamaParse" && !apiKey && !useDefault) {
    throw new Error("LlamaParse API Key is required");
  }

  try {
    const response = await fetchWithByokRetry(async () => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("provider", provider);
      if (useDefault) {
        formData.append("useDefault", "true");
      } else if (apiKey) {
        formData.append(
          "apiKeySecret",
          JSON.stringify(
            await encryptSecret(
              apiKey,
              getDocumentParseSecretContext(provider),
            ),
          ),
        );
      }

      return fetch("/api/doc-parse", {
        method: "POST",
        body: formData,
      });
    });

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Document parsing failed"),
      );
    }

    const data = await readJsonResponseOrThrow<DocumentParseStartResponse>(
      response,
      "Document parsing failed",
    );
    if ("markdown" in data) return data.markdown || "";
    if ("jobId" in data && data.jobId) {
      return pollDocumentParseJob(data.jobId);
    }

    throw new Error("Document parsing did not return a job id");
  } catch (error) {
    logDevError("Document parse error:", error);
    throw error;
  }
}

export async function parseDocumentWithLlama(
  file: File,
  apiKey?: string,
  useDefault = false,
): Promise<string> {
  return parseDocumentFile(file, {
    provider: "llamaParse",
    apiKey,
    useDefault,
  });
}
