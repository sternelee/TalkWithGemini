"use client";
import React, { useState } from "react";
import {
  X,
  Server,
  Globe,
  Mic,
  Settings,
  Cpu,
  FolderSearch,
  ShieldCheck,
  Brain,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import ProviderSettings from "./ProviderSettings";
import SearchSettings from "./SearchSettings";
import RAGSettings from "./RAGSettings";
import VoiceSettings from "./VoiceSettings";
import SystemSettings from "./SystemSettings";
import DefaultModelSettings from "./DefaultModelSettings";
import DeploymentHealth from "./DeploymentHealth";
import MemorySettings from "./MemorySettings";
import AboutSettings from "./AboutSettings";
import type { SettingsTabId } from "@/lib/chat/panelUrlState";

const SETTINGS_TABS: Array<{
  id: SettingsTabId;
  labelKey: string;
  Icon: LucideIcon;
}> = [
  { id: "providers", labelKey: "tabProviders", Icon: Server },
  { id: "defaults", labelKey: "tabDefaults", Icon: Cpu },
  { id: "search", labelKey: "tabSearch", Icon: Globe },
  { id: "rag", labelKey: "tabRag", Icon: FolderSearch },
  { id: "voice", labelKey: "tabVoice", Icon: Mic },
  { id: "memory", labelKey: "tabMemory", Icon: Brain },
  { id: "health", labelKey: "tabHealth", Icon: ShieldCheck },
  { id: "system", labelKey: "tabSystem", Icon: Settings },
  { id: "about", labelKey: "tabAbout", Icon: Info },
];

const renderTabContent = (activeTab: SettingsTabId) => {
  switch (activeTab) {
    case "providers":
      return <ProviderSettings />;
    case "defaults":
      return <DefaultModelSettings />;
    case "search":
      return <SearchSettings />;
    case "rag":
      return <RAGSettings />;
    case "voice":
      return <VoiceSettings />;
    case "memory":
      return <MemorySettings />;
    case "health":
      return <DeploymentHealth />;
    case "system":
      return <SystemSettings />;
    case "about":
      return <AboutSettings />;
  }
};

interface SettingsPageProps {
  onClose?: () => void;
  activeTab?: SettingsTabId;
  onTabChange?: (tab: SettingsTabId) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
  onClose,
  activeTab,
  onTabChange,
}) => {
  const t = useTranslations("SettingsPage");
  const [localActiveTab, setLocalActiveTab] =
    useState<SettingsTabId>("providers");
  const resolvedActiveTab = activeTab ?? localActiveTab;

  const setResolvedActiveTab = (tab: SettingsTabId) => {
    if (activeTab === undefined) {
      setLocalActiveTab(tab);
    }
    onTabChange?.(tab);
  };

  const focusTab = (tabId: SettingsTabId) => {
    requestAnimationFrame(() => {
      document.getElementById(`settings-tab-${tabId}`)?.focus();
    });
  };

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    tabId: SettingsTabId,
  ) => {
    const currentIndex = SETTINGS_TABS.findIndex((tab) => tab.id === tabId);
    if (currentIndex < 0) return;

    const lastIndex = SETTINGS_TABS.length - 1;
    const nextIndexByKey: Partial<Record<string, number>> = {
      ArrowDown: currentIndex === lastIndex ? 0 : currentIndex + 1,
      ArrowRight: currentIndex === lastIndex ? 0 : currentIndex + 1,
      ArrowUp: currentIndex === 0 ? lastIndex : currentIndex - 1,
      ArrowLeft: currentIndex === 0 ? lastIndex : currentIndex - 1,
      Home: 0,
      End: lastIndex,
    };

    const nextIndex = nextIndexByKey[event.key];
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextTab = SETTINGS_TABS[nextIndex];
    if (!nextTab) return;

    setResolvedActiveTab(nextTab.id);
    focusTab(nextTab.id);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background animate-in fade-in duration-300">
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-background/85 px-4 py-3 backdrop-blur-md md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border"
            aria-hidden="true"
          >
            <Settings size={18} />
          </div>
          <div className="min-w-0">
            <h1
              id="settings-title"
              className="truncate text-base font-semibold text-foreground"
            >
              {t("title")}
            </h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {t("sections")}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label={t("close")}
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex w-full shrink-0 flex-row overflow-x-auto border-b border-border bg-background/80 md:w-60 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
          <div
            role="tablist"
            aria-label={t("sections")}
            className="flex w-full flex-row gap-1 p-2 md:flex-col md:p-3"
          >
            {SETTINGS_TABS.map(({ id, labelKey, Icon }) => {
              const isSelected = resolvedActiveTab === id;

              return (
                <button
                  key={id}
                  id={`settings-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls={`settings-panel-${id}`}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => setResolvedActiveTab(id)}
                  onKeyDown={(event) => handleTabKeyDown(event, id)}
                  className={`flex min-h-10 items-center gap-2.5 whitespace-nowrap rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-[color,background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSelected
                      ? "border-brand bg-muted text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{t(labelKey)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-muted/20 dark:bg-transparent">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div
              id={`settings-panel-${resolvedActiveTab}`}
              role="tabpanel"
              aria-labelledby={`settings-tab-${resolvedActiveTab}`}
              className="mx-auto w-full max-w-5xl px-4 py-5 md:px-8 md:py-6"
            >
              {renderTabContent(resolvedActiveTab)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
