"use client";

import { PRODUCT_NAME } from "@/lib/product";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      aria-labelledby="route-error-title"
      aria-describedby="route-error-description"
      className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-8 text-foreground"
    >
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-sm">
        <h1
          id="route-error-title"
          className="text-base font-semibold text-pretty"
        >
          {PRODUCT_NAME} hit a problem
        </h1>
        <p
          id="route-error-description"
          className="mt-2 text-sm text-pretty text-muted-foreground"
        >
          The app shell is still available. Try reloading this view.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-muted-foreground/75">
            Reference:{" "}
            <span className="font-mono" translate="no">
              {error.digest}
            </span>
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
