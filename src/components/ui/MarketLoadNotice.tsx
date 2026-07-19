"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import type { MarketLoadStatus } from "@/lib/market/loadResult";

interface MarketLoadNoticeProps {
  status?: MarketLoadStatus;
  message: string;
  retryLabel: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

export default function MarketLoadNotice({
  status,
  message,
  retryLabel,
  onRetry,
  isRetrying = false,
}: MarketLoadNoticeProps) {
  if (status !== "stale" && status !== "fallback" && status !== "error") {
    return null;
  }

  const isError = status === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live="polite"
      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
        isError
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
      }`}
    >
      <span className="flex min-w-0 items-start gap-2">
        <AlertTriangle
          size={14}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <span>{message}</span>
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/10"
      >
        <RefreshCw
          size={12}
          className={isRetrying ? "animate-spin" : ""}
          aria-hidden="true"
        />
        {retryLabel}
      </button>
    </div>
  );
}
