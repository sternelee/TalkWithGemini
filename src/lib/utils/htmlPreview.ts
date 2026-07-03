import { HTML_PREVIEW_LIMITS } from "../../config/limits";

export const HTML_PREVIEW_CSP =
  "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";

export const HTML_PREVIEW_TRUNCATION_NOTICE =
  '\n<div style="position:fixed;left:16px;right:16px;bottom:16px;padding:10px 12px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;font:13px system-ui,sans-serif;z-index:2147483647">Preview truncated to fit local rendering limits.</div>';

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function clampPreviewHtml(rawHtml: string, maxChars: number): string {
  if (rawHtml.length <= maxChars) return rawHtml;

  const notice =
    maxChars > HTML_PREVIEW_TRUNCATION_NOTICE.length
      ? HTML_PREVIEW_TRUNCATION_NOTICE
      : "";
  return rawHtml.slice(0, Math.max(0, maxChars - notice.length)) + notice;
}

function injectPreviewCsp(html: string, cspMeta: string): string {
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(
      /<head(?:\s[^>]*)?>/i,
      (match) => `${match}\n${cspMeta}`,
    );
  }

  if (/<html(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(
      /<html(?:\s[^>]*)?>/i,
      (match) => `${match}\n<head>${cspMeta}</head>`,
    );
  }

  return `<!doctype html><html><head>${cspMeta}</head><body>${html}</body></html>`;
}

export function createSandboxedHtmlPreviewSrcDoc(
  rawHtml: string,
  maxChars: number = HTML_PREVIEW_LIMITS.maxSrcDocChars,
): string {
  const finalMaxChars = Math.max(0, Math.floor(maxChars));
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(
    HTML_PREVIEW_CSP,
  )}">`;

  let html = clampPreviewHtml(rawHtml, finalMaxChars);
  let srcDoc = injectPreviewCsp(html, cspMeta);
  if (srcDoc.length <= finalMaxChars) return srcDoc;

  const wrapperOverhead = Math.max(0, srcDoc.length - html.length);
  html = clampPreviewHtml(
    rawHtml,
    Math.max(0, finalMaxChars - wrapperOverhead),
  );
  srcDoc = injectPreviewCsp(html, cspMeta);

  return srcDoc.length <= finalMaxChars
    ? srcDoc
    : srcDoc.slice(0, finalMaxChars);
}
