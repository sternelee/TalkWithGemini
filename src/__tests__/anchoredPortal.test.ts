import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeAnchoredPortalStyle } from "../components/ui/AnchoredPortal";

describe("anchored portal positioning", () => {
  it("positions long top-end menus using the bounded max height", () => {
    const style = computeAnchoredPortalStyle({
      anchorRect: {
        left: 520,
        right: 720,
        top: 620,
        bottom: 652,
        width: 200,
      },
      viewportWidth: 800,
      viewportHeight: 700,
      naturalWidth: 224,
      naturalHeight: 900,
      placement: "top-end",
      offset: 8,
      maxHeight: 256,
      matchAnchorWidth: false,
    });

    expect(style.top).toBe(356);
    expect(style.left).toBe(496);
    expect(style.maxHeight).toBe(256);
  });

  it("clamps end alignment to the viewport margin", () => {
    const style = computeAnchoredPortalStyle({
      anchorRect: {
        left: 20,
        right: 70,
        top: 420,
        bottom: 452,
        width: 50,
      },
      viewportWidth: 300,
      viewportHeight: 600,
      naturalWidth: 120,
      naturalHeight: 100,
      placement: "top-end",
      offset: 8,
      matchAnchorWidth: false,
    });

    expect(style.left).toBe(8);
    expect(style.top).toBe(312);
  });

  it("flips bottom placement above the anchor when there is no room below", () => {
    const style = computeAnchoredPortalStyle({
      anchorRect: {
        left: 120,
        right: 220,
        top: 500,
        bottom: 532,
        width: 100,
      },
      viewportWidth: 640,
      viewportHeight: 600,
      naturalWidth: 180,
      naturalHeight: 140,
      placement: "bottom-start",
      offset: 8,
      matchAnchorWidth: false,
    });

    expect(style.top).toBe(352);
    expect(style.left).toBe(120);
  });

  it("measures before making portal content visible", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/ui/AnchoredPortal.tsx"),
      "utf8",
    );

    expect(source).toContain("useIsomorphicLayoutEffect");
    expect(source).toContain("HIDDEN_PORTAL_STYLE");
    expect(source).toContain("setIsPositioned(false)");
    expect(source).toContain("isPositioned ? style : HIDDEN_PORTAL_STYLE");
  });
});
