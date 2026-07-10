import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("settings form accessibility", () => {
  it("labels memory fields and requires a second destructive delete action", () => {
    const source = readSource("src/components/settings/MemorySettings.tsx");

    expect(source).toContain('htmlFor="memory-content"');
    expect(source).toContain('id="memory-content"');
    expect(source).toContain("aria-invalid={!!contentError}");
    expect(source).toContain('role="alert"');
    expect(source).toContain("pendingDeleteId === memory.id");
    expect(source).toContain('t("confirmDelete")');
    expect(source).toContain("new Intl.DateTimeFormat(locale");
    expect(source).toContain("<form");
    expect(source).toContain("onSubmit={(event)");
    expect(source).toContain('type="submit"');
  });

  it("connects access-password errors and status to the input", () => {
    const source = readSource("src/components/app/AccessPasswordPage.tsx");

    expect(source).toContain('aria-describedby="access-password-status"');
    expect(source).toContain("aria-invalid={isLocked || !!errorKey}");
    expect(source).toContain('id="access-password-status"');
    expect(source).toContain('aria-live="polite"');
  });

  it("uses the shared modal lifecycle for remote files", () => {
    const source = readSource("src/components/modals/RemoteFileModal.tsx");

    expect(source).toContain("useModalLifecycle");
    expect(source).toContain("trapModalFocus");
    expect(source).toContain("overscroll-contain");
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(source).toContain("window.matchMedia");
    expect(source).toContain("<form");
    expect(source).toContain("onSubmit={handleSubmit}");
    expect(source).toContain('type="submit"');
    expect(source).not.toContain('e.key === "Enter"');
  });
});
