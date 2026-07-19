export type MarketLoadStatus =
  "fresh" | "cache" | "stale" | "fallback" | "error";

export interface MarketLoadError {
  code?: string;
  message: string;
  retryable: boolean;
}

export interface MarketLoadResult<T> {
  data: T;
  status: MarketLoadStatus;
  source: string;
  fetchedAt?: number;
  error?: MarketLoadError;
  fallbackFrom?: {
    source: string;
    error?: MarketLoadError;
  };
}

export function toMarketLoadError(
  error: unknown,
  fallbackMessage: string,
): MarketLoadError {
  const raw =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown })
      : null;
  const message =
    typeof raw?.message === "string" && raw.message.trim()
      ? raw.message.trim()
      : fallbackMessage;
  const code =
    typeof raw?.code === "string" && raw.code.trim()
      ? raw.code.trim()
      : undefined;

  return {
    ...(code ? { code } : {}),
    message,
    retryable: true,
  };
}
