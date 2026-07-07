"use client";
import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { SERVER_DEFAULT_PROVIDER_ID } from "@/lib/defaultConfig/shared";
import { readJsonResponseOrThrow } from "@/lib/api/client";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { useSettingsStore } from "@/store/core/settingsStore";
import type {
  ServiceHealthServiceKey,
  ServiceHealthState,
  ServiceHealthStatus,
} from "@/types";

type HealthState = "ok" | "warning" | "blocked" | "missing";

interface HealthItem {
  key: string;
  label: string;
  detail: string;
  state: HealthState;
}

const stateStyles: Record<
  HealthState,
  { Icon: typeof CheckCircle2; className: string; dotClassName: string }
> = {
  ok: {
    Icon: CheckCircle2,
    className:
      "border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100",
    dotClassName: "bg-emerald-500",
  },
  warning: {
    Icon: AlertTriangle,
    className:
      "border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100",
    dotClassName: "bg-amber-500",
  },
  blocked: {
    Icon: ShieldAlert,
    className:
      "border-red-200 bg-red-50/80 text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100",
    dotClassName: "bg-red-500",
  },
  missing: {
    Icon: CircleDashed,
    className:
      "border-gray-200 bg-white/80 text-gray-700 dark:border-border dark:bg-card/70 dark:text-muted-foreground",
    dotClassName: "bg-gray-400",
  },
};

function storeState(value?: "memory" | "shared" | "missing"): HealthState {
  if (value === "shared") return "ok";
  if (value === "missing") return "blocked";
  return "warning";
}

function runtimeToHealthState(status?: ServiceHealthState): HealthState | null {
  if (!status) return null;
  if (status === "available") return "ok";
  if (status === "policy_blocked" || status === "upstream_failed") {
    return "blocked";
  }
  if (status === "missing_key" || status === "unconfigured") return "missing";
  return "warning";
}

const healthSeverity: Record<HealthState, number> = {
  ok: 0,
  missing: 1,
  warning: 2,
  blocked: 3,
};

function strongestHealthState(states: HealthState[]): HealthState {
  return states.reduce((strongest, state) =>
    healthSeverity[state] > healthSeverity[strongest] ? state : strongest,
  );
}

const DeploymentHealth: React.FC = () => {
  const t = useTranslations("DeploymentHealth");
  const [runtimeHealth, setRuntimeHealth] =
    useState<ServiceHealthStatus | null>(null);
  const { providers, defaultModels } = useCoreSettingsStore();
  const { serverConfig, search, rag, voice, installedPlugins } =
    useSettingsStore();
  const deployment = serverConfig?.deployment;
  const deploymentMode = deployment?.mode || "local";
  const sharedStoresOk =
    deployment?.rateLimitStore === "shared" &&
    deployment.documentParseJobStore === "shared" &&
    deployment.pluginRegistryStore === "shared";
  const hasUsableModel =
    Boolean(serverConfig?.modelProvider.available) ||
    providers.some(
      (provider) =>
        provider.enabled &&
        (provider.id === SERVER_DEFAULT_PROVIDER_ID ||
          Boolean(provider.apiKeySecret) ||
          Boolean(provider.apiKey?.trim())),
    ) ||
    Object.values(defaultModels).some(Boolean);
  const hasSearch =
    Boolean(serverConfig?.search.available) || search.provider !== "google";
  const hasRag =
    Boolean(serverConfig?.rag.vectorStoreAvailable) ||
    Boolean(serverConfig?.rag.documentProcessingAvailable) ||
    Boolean(rag.url?.trim()) ||
    Boolean(rag.tokenSecret) ||
    Boolean(rag.mineruApiToken?.trim()) ||
    Boolean(rag.mineruApiTokenSecret) ||
    Boolean(rag.llamaParseApiKey?.trim()) ||
    Boolean(rag.llamaParseApiKeySecret);
  const hasVoice =
    Boolean(
      serverConfig?.voice.defaultSttAvailable ||
      serverConfig?.voice.defaultTtsAvailable,
    ) ||
    voice.sttProvider !== "browser" ||
    voice.ttsProvider !== "browser";
  const runtimeServices = runtimeHealth?.services;
  const runtimeState = (service: ServiceHealthServiceKey) =>
    runtimeToHealthState(runtimeServices?.[service]?.status);
  const runtimeStoreState = runtimeServices
    ? strongestHealthState(
        [
          runtimeState("rateLimitStore"),
          runtimeState("documentParseJobStore"),
          runtimeState("pluginRegistry"),
        ].filter((state): state is HealthState => Boolean(state)),
      )
    : null;

  useEffect(() => {
    let cancelled = false;

    fetch("/api/health", { cache: "no-store" })
      .then((response) =>
        readJsonResponseOrThrow<ServiceHealthStatus>(
          response,
          "Failed to load deployment health",
        ),
      )
      .then((health) => {
        if (!cancelled) setRuntimeHealth(health);
      })
      .catch(() => {
        if (!cancelled) setRuntimeHealth(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const items: HealthItem[] = [
    {
      key: "deployment",
      label: t("deploymentMode"),
      state: "ok",
      detail: deploymentMode === "hosted" ? t("modeHosted") : t("modeLocal"),
    },
    {
      key: "access",
      label: t("accessPassword"),
      state:
        runtimeState("accessPassword") ||
        (deployment?.accessPasswordEnabled ? "ok" : "warning"),
      detail: deployment?.accessPasswordEnabled
        ? t("accessPasswordEnabled")
        : t("accessPasswordMissing"),
    },
    {
      key: "byok",
      label: t("byok"),
      state:
        runtimeState("byok") ||
        (deployment?.byokStableKeyConfigured
          ? "ok"
          : deployment?.byokEphemeralAllowed
            ? "warning"
            : "blocked"),
      detail: deployment?.byokStableKeyConfigured
        ? t("byokStable")
        : deployment?.byokEphemeralAllowed
          ? t("byokEphemeral")
          : t("byokMissing"),
    },
    {
      key: "apiProof",
      label: t("apiProof"),
      state:
        runtimeState("apiProof") ||
        (deployment?.apiProof?.enabled
          ? "ok"
          : deployment?.apiProof?.required
            ? "blocked"
            : "warning"),
      detail: deployment?.apiProof?.enabled
        ? t("apiProofEnabled")
        : deployment?.apiProof?.required
          ? t("apiProofMissing")
          : t("apiProofLocal"),
    },
    {
      key: "stores",
      label: t("sharedStores"),
      state:
        runtimeStoreState ||
        (sharedStoresOk
          ? "ok"
          : deploymentMode === "hosted"
            ? "blocked"
            : storeState(deployment?.rateLimitStore)),
      detail: sharedStoresOk
        ? t("storesShared")
        : deploymentMode === "hosted"
          ? t("storesMissingHosted")
          : t("storesMemory"),
    },
    {
      key: "model",
      label: t("defaultModel"),
      state: hasUsableModel ? "ok" : runtimeState("defaultModel") || "missing",
      detail: hasUsableModel
        ? t("defaultModelReady")
        : t("defaultModelMissing"),
    },
    {
      key: "search",
      label: t("search"),
      state: hasSearch ? "ok" : runtimeState("search") || "missing",
      detail: hasSearch ? t("searchReady") : t("searchMissing"),
    },
    {
      key: "rag",
      label: t("rag"),
      state: hasRag ? "ok" : runtimeState("rag") || "missing",
      detail: hasRag ? t("ragReady") : t("ragMissing"),
    },
    {
      key: "voice",
      label: t("voice"),
      state: hasVoice ? "ok" : runtimeState("voice") || "missing",
      detail: hasVoice ? t("voiceReady") : t("voiceMissing"),
    },
    {
      key: "plugins",
      label: t("plugins"),
      state:
        deploymentMode === "hosted" &&
        deployment?.pluginRegistryStore !== "shared"
          ? runtimeState("pluginRegistry") || "blocked"
          : installedPlugins.length > 0
            ? "ok"
            : runtimeState("pluginRegistry") || "missing",
      detail:
        deploymentMode === "hosted" &&
        deployment?.pluginRegistryStore !== "shared"
          ? t("pluginsRegistryMissingHosted")
          : installedPlugins.length > 0
            ? t("pluginsReady")
            : t("pluginsMissing"),
    },
  ];

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-400/10 dark:text-blue-200 dark:ring-blue-400/20"
          aria-hidden="true"
        >
          <ShieldCheck size={20} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-foreground">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const meta = stateStyles[item.state];
          const Icon = meta.Icon;

          return (
            <div
              key={item.key}
              className={`flex min-w-0 items-start gap-3 rounded-lg border p-3 ${meta.className}`}
            >
              <Icon className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${meta.dotClassName}`}
                    aria-hidden="true"
                  />
                  <h3 className="truncate text-sm font-semibold">
                    {item.label}
                  </h3>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-90">
                  {item.detail}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default DeploymentHealth;
