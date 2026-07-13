import { HTML_PREVIEW_LIMITS } from "@/config/limits";

export const HTML_PREVIEW_TRUNCATION_NOTICE =
  '\n<div style="position:fixed;left:16px;right:16px;bottom:16px;padding:10px 12px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;font:13px system-ui,sans-serif;z-index:2147483647">Preview truncated to fit local rendering limits.</div>';

const HTML_PREVIEW_BOOTSTRAP = `<script>
(() => {
  function createPreviewStorage() {
    const values = new Map();
    return {
      get length() {
        return values.size;
      },
      key(index) {
        return Array.from(values.keys())[index] ?? null;
      },
      getItem(key) {
        key = String(key);
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(String(key), String(value));
      },
      removeItem(key) {
        values.delete(String(key));
      },
      clear() {
        values.clear();
      }
    };
  }

  function installPreviewStorage(name) {
    try {
      const storage = window[name];
      const probeKey = "__neo_preview_storage_probe__";
      storage.setItem(probeKey, probeKey);
      storage.removeItem(probeKey);
    } catch {
      Object.defineProperty(window, name, {
        configurable: true,
        value: createPreviewStorage()
      });
    }
  }

  installPreviewStorage("localStorage");
  installPreviewStorage("sessionStorage");
})();
</script>`;

function clampPreviewHtml(rawHtml: string, maxChars: number): string {
  if (rawHtml.length <= maxChars) return rawHtml;

  const notice =
    maxChars > HTML_PREVIEW_TRUNCATION_NOTICE.length
      ? HTML_PREVIEW_TRUNCATION_NOTICE
      : "";
  return rawHtml.slice(0, Math.max(0, maxChars - notice.length)) + notice;
}

function ensurePreviewDocument(html: string): string {
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(
      /<head(?:\s[^>]*)?>/i,
      (match) => `${match}\n${HTML_PREVIEW_BOOTSTRAP}`,
    );
  }

  if (/<html(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(
      /<html(?:\s[^>]*)?>/i,
      (match) => `${match}\n<head>${HTML_PREVIEW_BOOTSTRAP}</head>`,
    );
  }

  return `<!doctype html><html><head>${HTML_PREVIEW_BOOTSTRAP}</head><body>${html}</body></html>`;
}

export function createSandboxedHtmlPreviewSrcDoc(
  rawHtml: string,
  maxChars: number = HTML_PREVIEW_LIMITS.maxSrcDocChars,
): string {
  const finalMaxChars = Math.max(0, Math.floor(maxChars));

  let html = clampPreviewHtml(rawHtml, finalMaxChars);
  let srcDoc = ensurePreviewDocument(html);
  if (srcDoc.length <= finalMaxChars) return srcDoc;

  const wrapperOverhead = Math.max(0, srcDoc.length - html.length);
  html = clampPreviewHtml(
    rawHtml,
    Math.max(0, finalMaxChars - wrapperOverhead),
  );
  srcDoc = ensurePreviewDocument(html);

  return srcDoc.length <= finalMaxChars
    ? srcDoc
    : srcDoc.slice(0, finalMaxChars);
}
