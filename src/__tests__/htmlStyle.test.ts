import { describe, expect, it } from "vitest";
import {
  sanitizeHtmlStyle,
  sanitizeHtmlTableContainerStyle,
} from "../lib/utils/htmlStyle";

describe("HTML style sanitization", () => {
  it("keeps safe layout styles from CSS strings and JSX style objects", () => {
    expect(
      sanitizeHtmlStyle(
        "display:grid; grid-template-columns:1fr 1fr; gap:12px; color:#2563eb",
      ),
    ).toEqual({
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "12px",
      color: "var(--html-visual-info-foreground)",
    });

    expect(
      sanitizeHtmlStyle({
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "12px",
      }),
    ).toMatchObject({
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "12px",
    });
  });

  it("maps pure neutral colors to HTML visual theme variables", () => {
    expect(
      sanitizeHtmlStyle(
        "color:#fff; background:#000; border-color:white; box-shadow:0 4px 16px rgba(0,0,0,0.28)",
      ),
    ).toMatchObject({
      color: "var(--html-visual-foreground)",
      background: "var(--html-visual-surface)",
      borderColor: "var(--html-visual-subtle-border)",
      boxShadow: "var(--html-visual-shadow)",
    });
  });

  it("corrects low-contrast text against an explicit background", () => {
    expect(
      sanitizeHtmlStyle(
        "background:#edf8ff; color:#ffffff; border:1px solid #e5e7eb",
      ),
    ).toMatchObject({
      background: "#edf8ff",
      color: "var(--html-visual-on-light)",
      border: "1px solid var(--html-visual-subtle-border)",
    });

    expect(
      sanitizeHtmlStyle({
        backgroundColor: "rgb(15 23 42)",
        color: "rgb(2 6 23)",
      }),
    ).toMatchObject({
      backgroundColor: "rgb(15 23 42)",
      color: "var(--html-visual-on-dark)",
    });
  });

  it("maps recognized Tailwind and neon palette colors to theme-safe variables", () => {
    expect(
      sanitizeHtmlStyle(
        "background:#ecfeff; color:#155e75; border:1px solid #a5f3fc",
      ),
    ).toMatchObject({
      background: "var(--html-visual-info-surface)",
      color: "var(--html-visual-info-foreground)",
      border: "1px solid var(--html-visual-info-border)",
    });

    expect(
      sanitizeHtmlStyle(
        "background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe",
      ),
    ).toMatchObject({
      background: "var(--html-visual-info-surface)",
      color: "var(--html-visual-info-foreground)",
      border: "1px solid var(--html-visual-info-border)",
    });

    expect(
      sanitizeHtmlStyle(
        "background:#f5f3ff; color:#6d28d9; border-color:#ddd6fe",
      ),
    ).toMatchObject({
      background: "var(--html-visual-knowledge-surface)",
      color: "var(--html-visual-knowledge-foreground)",
      borderColor: "var(--html-visual-knowledge-border)",
    });

    expect(
      sanitizeHtmlStyle(
        "background:#ecfdf5; color:#047857; border-color:#a7f3d0",
      ),
    ).toMatchObject({
      background: "var(--html-visual-success-surface)",
      color: "var(--html-visual-success-foreground)",
      borderColor: "var(--html-visual-success-border)",
    });

    expect(
      sanitizeHtmlStyle(
        "background:#fffbeb; color:#92400e; border-color:#fde68a",
      ),
    ).toMatchObject({
      background: "var(--html-visual-warning-surface)",
      color: "var(--html-visual-warning-foreground)",
      borderColor: "var(--html-visual-warning-border)",
    });

    expect(
      sanitizeHtmlStyle(
        "background:#fff1f2; color:#be123c; border-color:#fecdd3",
      ),
    ).toMatchObject({
      background: "var(--html-visual-danger-surface)",
      color: "var(--html-visual-danger-foreground)",
      borderColor: "var(--html-visual-danger-border)",
    });
  });

  it("falls back complex non-themeable backgrounds to the HTML visual surface", () => {
    expect(
      sanitizeHtmlStyle({
        background: "linear-gradient(135deg, #f8fafc, #e0f2fe)",
        color: "#f8fafc",
      }),
    ).toMatchObject({
      background: "var(--html-visual-surface)",
      color: "var(--html-visual-foreground)",
    });
  });

  it("drops unsafe style values and page-covering positioning", () => {
    expect(
      sanitizeHtmlStyle({
        display: "flex",
        position: "fixed",
        zIndex: 9999,
        background: "url(javascript:alert(1))",
      }),
    ).toEqual({
      display: "flex",
    });
  });

  it("strips decorative styles from HTML visual table containers", () => {
    expect(
      sanitizeHtmlTableContainerStyle(
        "display:block; overflow-x:auto; background:#fff1f2; border:1px solid #fecaca; box-shadow:0 8px 24px rgba(0,0,0,0.12); padding:32px; border-radius:16px; color:#0f172a",
      ),
    ).toEqual({
      display: "block",
      overflowX: "auto",
      color: "#0f172a",
    });
  });
});
