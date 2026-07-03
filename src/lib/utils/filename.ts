import { DOWNLOAD_LIMITS } from "../../config/limits";

const RESERVED_WINDOWS_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

function splitExtension(name: string): { stem: string; extension: string } {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) {
    return { stem: name, extension: "" };
  }

  return {
    stem: name.slice(0, lastDot),
    extension: name.slice(lastDot),
  };
}

export function sanitizeDownloadFilename(
  value: unknown,
  fallback = "download",
): string {
  const raw = typeof value === "string" ? value : "";
  const normalized = raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .trim()
    .replace(/^[.\s_]+|[.\s_]+$/g, "");

  const fallbackName =
    fallback
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
      .trim()
      .replace(/^[.\s_]+|[.\s_]+$/g, "") || "download";

  const candidate = normalized || fallbackName;
  const { stem, extension } = splitExtension(candidate);
  if (!stem || RESERVED_WINDOWS_NAMES.has(stem.toLowerCase())) {
    return fallbackName.slice(0, DOWNLOAD_LIMITS.maxFileNameChars);
  }

  const maxStemLength = Math.max(
    1,
    DOWNLOAD_LIMITS.maxFileNameChars - extension.length,
  );

  return `${stem.slice(0, maxStemLength)}${extension}`.slice(
    0,
    DOWNLOAD_LIMITS.maxFileNameChars,
  );
}
