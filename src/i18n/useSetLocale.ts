"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { LOCALE_COOKIE } from "./constants";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Returns a setter for the interface language. It keeps the zustand store (the
 * selector UI's source of truth) in sync, persists the choice to the
 * `NEXT_LOCALE` cookie so the server can resolve it on the next render, and
 * refreshes the route so server-provided messages update without a full reload.
 *
 * Pass "auto" to follow the browser's `Accept-Language`.
 */
export function useSetLocale() {
  const router = useRouter();
  const setLanguage = useCoreSettingsStore((state) => state.setLanguage);

  return useCallback(
    (language: string) => {
      setLanguage(language);
      document.cookie = `${LOCALE_COOKIE}=${language}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
      router.refresh();
    },
    [router, setLanguage],
  );
}
