import { describe, expect, it } from "vitest";
import { getNextMenuItemIndex } from "../components/ui/primitives";

describe("menu keyboard navigation", () => {
  it("wraps roving menu focus with arrow, home, and end keys", () => {
    expect(getNextMenuItemIndex(0, 4, "ArrowDown")).toBe(1);
    expect(getNextMenuItemIndex(3, 4, "ArrowDown")).toBe(0);
    expect(getNextMenuItemIndex(0, 4, "ArrowUp")).toBe(3);
    expect(getNextMenuItemIndex(2, 4, "Home")).toBe(0);
    expect(getNextMenuItemIndex(2, 4, "End")).toBe(3);
    expect(getNextMenuItemIndex(2, 4, "Escape")).toBe(2);
    expect(getNextMenuItemIndex(2, 0, "ArrowDown")).toBe(-1);
  });
});
