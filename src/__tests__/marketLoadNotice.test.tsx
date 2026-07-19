// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MarketLoadNotice from "@/components/ui/MarketLoadNotice";

afterEach(cleanup);

describe("MarketLoadNotice", () => {
  it.each(["fresh", "cache"] as const)(
    "does not show a warning for %s data",
    (status) => {
      const { container } = render(
        <MarketLoadNotice
          status={status}
          message="Degraded"
          retryLabel="Retry"
          onRetry={vi.fn()}
        />,
      );

      expect(container.textContent).toBe("");
    },
  );

  it.each(["stale", "fallback"] as const)(
    "keeps %s data visible with a retryable status notice",
    (status) => {
      const onRetry = vi.fn();
      render(
        <MarketLoadNotice
          status={status}
          message="Using retained market data"
          retryLabel="Retry"
          onRetry={onRetry}
        />,
      );

      expect(screen.getByRole("status").textContent).toContain(
        "Using retained market data",
      );
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    },
  );

  it("announces an uncached request failure as an error", () => {
    render(
      <MarketLoadNotice
        status="error"
        message="Market request failed"
        retryLabel="Retry"
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Market request failed",
    );
  });
});
