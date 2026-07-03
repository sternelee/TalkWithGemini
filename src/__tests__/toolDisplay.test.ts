import { describe, expect, it } from "vitest";
import { TOOL_DISPLAY_LIMITS } from "../config/limits";
import {
  formatToolDisplayName,
  formatToolDisplayValue,
} from "../lib/utils/toolDisplay";

describe("tool display serialization", () => {
  it("serializes circular values without throwing", () => {
    const value: Record<string, unknown> = { name: "root" };
    value.self = value;

    const display = formatToolDisplayValue(value);

    expect(display.truncated).toBe(true);
    expect(display.text).toContain("[Circular]");
  });

  it("caps deep and wide structures", () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < TOOL_DISPLAY_LIMITS.maxDepth + 2; index += 1) {
      deep = { child: deep };
    }
    const wide = Object.fromEntries(
      Array.from(
        { length: TOOL_DISPLAY_LIMITS.maxObjectEntries + 3 },
        (_, index) => [`key-${index}`, index],
      ),
    );

    const deepDisplay = formatToolDisplayValue(deep);
    const wideDisplay = formatToolDisplayValue(wide);

    expect(deepDisplay.truncated).toBe(true);
    expect(deepDisplay.text).toContain("Max depth");
    expect(wideDisplay.truncated).toBe(true);
    expect(wideDisplay.text).toContain("__omitted_keys__");
  });

  it("caps long strings and final rendered output", () => {
    const display = formatToolDisplayValue({
      text: "x".repeat(TOOL_DISPLAY_LIMITS.maxRenderedChars * 2),
    });

    expect(display.truncated).toBe(true);
    expect(display.text.length).toBeLessThanOrEqual(
      TOOL_DISPLAY_LIMITS.maxRenderedChars,
    );
    expect(display.text).toContain("...");
  });

  it("formats and caps display names", () => {
    const name = formatToolDisplayName(
      `very_long_tool_name_${"x".repeat(TOOL_DISPLAY_LIMITS.maxToolNameChars)}`,
    );

    expect(name).toContain("Very Long Tool Name");
    expect(name.length).toBeLessThanOrEqual(
      TOOL_DISPLAY_LIMITS.maxToolNameChars,
    );
  });
});
