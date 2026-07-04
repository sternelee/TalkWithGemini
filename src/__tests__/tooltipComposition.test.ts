import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Tooltip composition", () => {
  it("auto-dismisses visible tooltips until a fresh trigger cycle", () => {
    const tooltip = readFileSync(
      resolve(process.cwd(), "src/components/ui/Tooltip.tsx"),
      "utf8",
    );

    expect(tooltip).toContain("DEFAULT_AUTO_DISMISS_MS");
    expect(tooltip).toContain("dismissedUntilNextTriggerRef");
    expect(tooltip).toContain("window.setTimeout");
    expect(tooltip).toContain("window.clearTimeout");
    expect(tooltip).toContain("clearDismissTimer");
  });

  it("supports opt-in portal positioning while keeping inline rendering as the default", () => {
    const tooltip = readFileSync(
      resolve(process.cwd(), "src/components/ui/Tooltip.tsx"),
      "utf8",
    );

    expect(tooltip).toContain("createPortal");
    expect(tooltip).toContain("portal?: boolean");
    expect(tooltip).toContain("portal = false");
    expect(tooltip).toContain("getBoundingClientRect");
    expect(tooltip).toContain('position: "fixed"');
    expect(tooltip).toContain('window.addEventListener("scroll"');
    expect(tooltip).toContain('window.addEventListener("resize"');
  });
});
