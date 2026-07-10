"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

const ACCESS_ERROR_CODES = {
  invalid: "ACCESS_PASSWORD_INVALID",
  locked: "ACCESS_PASSWORD_LOCKED",
} as const;

type AccessVerifyResponse = {
  ok?: boolean;
  code?: string;
  remainingAttempts?: number;
  lockedUntil?: number;
};

function formatLockTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function AccessPasswordPage({
  initialLockedUntil,
}: {
  initialLockedUntil?: number;
}) {
  const t = useTranslations("AccessPassword");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<
    number | undefined
  >();
  const [lockedUntil, setLockedUntil] = useState(initialLockedUntil);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!lockedUntil || lockedUntil <= Date.now()) return;

    const interval = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (lockedUntil <= nextNow) {
        window.clearInterval(interval);
        setLockedUntil(undefined);
        setRemainingAttempts(undefined);
        setErrorKey((current) => (current === "locked" ? null : current));
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [lockedUntil]);

  const remainingLockSeconds = useMemo(() => {
    if (!lockedUntil) return 0;
    return Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  }, [lockedUntil, now]);

  const isLocked = remainingLockSeconds > 0;
  const trimmedPassword = password.trim();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedPassword || isSubmitting || isLocked) return;

    setIsSubmitting(true);
    setErrorKey(null);

    try {
      const response = await fetch("/api/access/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: trimmedPassword }),
      });
      const data = (await response
        .json()
        .catch(() => ({}))) as AccessVerifyResponse;

      if (response.ok && data.ok) {
        router.refresh();
        return;
      }

      setRemainingAttempts(data.remainingAttempts);
      if (data.code === ACCESS_ERROR_CODES.locked && data.lockedUntil) {
        setLockedUntil(data.lockedUntil);
        setNow(Date.now());
        setErrorKey("locked");
      } else if (data.code === ACCESS_ERROR_CODES.invalid) {
        setErrorKey("invalid");
      } else {
        setErrorKey("genericError");
      }
    } catch {
      setErrorKey("genericError");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
            <LockKeyhole size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal text-foreground">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-surface rounded-lg border p-4 shadow-sm"
        >
          <label
            htmlFor="access-password"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            {t("passwordLabel")}
          </label>
          <div className="flex gap-2">
            <input
              id="access-password"
              name="accessPassword"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              spellCheck={false}
              disabled={isSubmitting || isLocked}
              placeholder={t("passwordPlaceholder")}
              aria-invalid={isLocked || !!errorKey}
              aria-describedby="access-password-status"
              className="min-w-0 flex-1 rounded-lg border border-input bg-muted px-3 py-2 font-mono text-sm text-foreground transition-[background-color,border-color,box-shadow,color] placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:border-blue-400"
            />
            <button
              type="submit"
              disabled={!trimmedPassword || isSubmitting || isLocked}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={isSubmitting ? t("verifying") : t("submit")}
            >
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div
            id="access-password-status"
            role={isLocked || errorKey ? "alert" : "status"}
            aria-live="polite"
            className="mt-3 min-h-5 text-xs"
          >
            {isLocked ? (
              <p className="text-amber-600 dark:text-amber-300">
                {t("locked", { time: formatLockTime(remainingLockSeconds) })}
              </p>
            ) : errorKey === "invalid" ? (
              <p className="text-red-600 dark:text-red-300">
                {remainingAttempts !== undefined
                  ? t("invalidWithRemaining", { count: remainingAttempts })
                  : t("invalid")}
              </p>
            ) : errorKey ? (
              <p className="text-red-600 dark:text-red-300">{t(errorKey)}</p>
            ) : (
              <p className="text-muted-foreground">{t("secretStored")}</p>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
