"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  ChatPanel,
  SettingsTabId,
  parseChatPanelUrlState,
  setChatPanelUrlState,
} from "@/lib/chat/panelUrlState";

interface UseChatPanelNavigationResult {
  viewMode: ChatPanel;
  settingsTab: SettingsTabId;
  isSidebarOpen: boolean;
  isNonDesktopViewport: boolean;
  isSidebarDrawerOpen: boolean;
  mainInertProps: React.HTMLAttributes<HTMLElement> & { inert?: boolean };
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToPanel: (
    panel: ChatPanel,
    nextSettingsTab?: SettingsTabId | null,
    historyMode?: "push" | "replace",
  ) => void;
  handleSettingsTabChange: (tab: SettingsTabId) => void;
}

export function useChatPanelNavigation(): UseChatPanelNavigationResult {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNonDesktopViewport, setIsNonDesktopViewport] = useState(false);
  const [viewMode, setViewMode] = useState<ChatPanel>("chat");
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>("providers");

  const updateBrowserSearch = useCallback(
    (params: URLSearchParams, historyMode: "push" | "replace") => {
      if (typeof window === "undefined") return;

      const search = params.toString();
      const nextUrl = `${window.location.pathname}${
        search ? `?${search}` : ""
      }${window.location.hash}`;
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextUrl === currentUrl) return;

      if (historyMode === "replace") {
        window.history.replaceState(null, "", nextUrl);
      } else {
        window.history.pushState(null, "", nextUrl);
      }
    },
    [],
  );

  const updatePanelUrl = useCallback(
    (
      panel: ChatPanel,
      nextSettingsTab?: SettingsTabId | null,
      historyMode: "push" | "replace" = "push",
    ) => {
      if (typeof window === "undefined") return;

      const nextParams = setChatPanelUrlState(
        new URLSearchParams(window.location.search),
        { panel, settingsTab: nextSettingsTab },
      );
      updateBrowserSearch(nextParams, historyMode);
    },
    [updateBrowserSearch],
  );

  const navigateToPanel = useCallback(
    (
      panel: ChatPanel,
      nextSettingsTab?: SettingsTabId | null,
      historyMode: "push" | "replace" = "push",
    ) => {
      const resolvedSettingsTab =
        panel === "settings" ? (nextSettingsTab ?? settingsTab) : null;

      setViewMode(panel);
      if (resolvedSettingsTab) {
        setSettingsTab(resolvedSettingsTab);
      }
      updatePanelUrl(panel, resolvedSettingsTab, historyMode);
      if (isNonDesktopViewport) {
        setIsSidebarOpen(false);
      }
    },
    [isNonDesktopViewport, settingsTab, updatePanelUrl],
  );

  const handleSettingsTabChange = useCallback(
    (tab: SettingsTabId) => {
      setSettingsTab(tab);
      if (viewMode === "settings") {
        updatePanelUrl("settings", tab);
      }
    },
    [updatePanelUrl, viewMode],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncPanelFromUrl = () => {
      const parsed = parseChatPanelUrlState(
        new URLSearchParams(window.location.search),
      );
      setViewMode(parsed.panel);
      setSettingsTab(parsed.settingsTab ?? "providers");
      if (parsed.needsReplace) {
        updateBrowserSearch(parsed.normalizedSearchParams, "replace");
      }
    };

    syncPanelFromUrl();
    window.addEventListener("popstate", syncPanelFromUrl);
    return () => window.removeEventListener("popstate", syncPanelFromUrl);
  }, [updateBrowserSearch]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateViewport = () => {
      setIsNonDesktopViewport(window.innerWidth < 1024);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth > 768) {
      setIsSidebarOpen(true);
    }
  }, []);

  const isSidebarDrawerOpen = isSidebarOpen && isNonDesktopViewport;

  useEffect(() => {
    if (!isSidebarDrawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isSidebarDrawerOpen]);

  const mainInertProps = useMemo<
    React.HTMLAttributes<HTMLElement> & { inert?: boolean }
  >(
    () => (isSidebarDrawerOpen ? { inert: true, "aria-hidden": true } : {}),
    [isSidebarDrawerOpen],
  );

  return {
    viewMode,
    settingsTab,
    isSidebarOpen,
    isNonDesktopViewport,
    isSidebarDrawerOpen,
    mainInertProps,
    setIsSidebarOpen,
    navigateToPanel,
    handleSettingsTabChange,
  };
}
