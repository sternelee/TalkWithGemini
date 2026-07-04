import React from "react";
import { Download, Loader2, Sun, Moon, Laptop } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSettingsStore } from "@/store/core/settingsStore";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { useSetLocale } from "@/i18n/useSetLocale";
import { SegmentedControl, SimpleSwitch } from "./SettingsUI";
import { AppSettings } from "@/types";
import { SYSTEM_SETTINGS_LIMITS } from "@/config/limits";

const SystemSettings = () => {
  const t = useTranslations("System");
  const { clearAllData, exportAllData, system, updateSystemSettings } =
    useSettingsStore();
  const [isExportingData, setIsExportingData] = React.useState(false);
  const [exportDataError, setExportDataError] = React.useState<string | null>(
    null,
  );
  const [isClearingData, setIsClearingData] = React.useState(false);
  const [isClearConfirming, setIsClearConfirming] = React.useState(false);
  const [clearDataError, setClearDataError] = React.useState<string | null>(
    null,
  );
  const clearConfirmTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const { theme, setTheme, language } = useCoreSettingsStore();
  const setLocale = useSetLocale();

  React.useEffect(() => {
    return () => {
      if (clearConfirmTimerRef.current) {
        clearTimeout(clearConfirmTimerRef.current);
        clearConfirmTimerRef.current = null;
      }
    };
  }, []);

  const clearClearConfirmation = () => {
    if (clearConfirmTimerRef.current) {
      clearTimeout(clearConfirmTimerRef.current);
      clearConfirmTimerRef.current = null;
    }
    setIsClearConfirming(false);
  };

  const handleClearAllData = async () => {
    if (isClearingData) return;

    if (!isClearConfirming) {
      setClearDataError(null);
      setIsClearConfirming(true);
      if (clearConfirmTimerRef.current) {
        clearTimeout(clearConfirmTimerRef.current);
      }
      clearConfirmTimerRef.current = setTimeout(() => {
        clearConfirmTimerRef.current = null;
        setIsClearConfirming(false);
      }, 5000);
      return;
    }

    clearClearConfirmation();
    setIsClearingData(true);
    setClearDataError(null);
    try {
      await clearAllData();
    } catch (error) {
      setClearDataError(
        error instanceof Error ? error.message : t("clearError"),
      );
      setIsClearingData(false);
    }
  };

  const handleExportAllData = async () => {
    if (isExportingData) return;

    setIsExportingData(true);
    setExportDataError(null);
    try {
      const payload = await exportAllData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `neo-chat-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportDataError(
        error instanceof Error ? error.message : t("exportError"),
      );
    } finally {
      setIsExportingData(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Appearance */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground">
          {t("appearance")}
        </h3>
        <SegmentedControl
          ariaLabel={t("appearanceThemeAria")}
          options={[
            { value: "light", label: t("themeLight"), icon: Sun },
            { value: "dark", label: t("themeDark"), icon: Moon },
            { value: "system", label: t("themeSystem"), icon: Laptop },
          ]}
          value={theme}
          onChange={(val) => setTheme(val as AppSettings["theme"])}
        />
      </section>

      {/* Language */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground">
          {t("language")}
        </h3>
        <SegmentedControl
          ariaLabel={t("interfaceLanguageAria")}
          options={[
            { value: "en", label: t("langEnglish") },
            { value: "zh", label: t("langChinese") },
            { value: "auto", label: t("langSystem") },
          ]}
          value={language}
          onChange={(val) => setLocale(val as AppSettings["language"])}
        />
      </section>

      {/* Font Size */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground">
          {t("fontSize")}
        </h3>
        <SegmentedControl
          ariaLabel={t("fontSizeAria")}
          options={[
            { value: "small", label: t("fontSmall") },
            { value: "medium", label: t("fontMedium") },
            { value: "large", label: t("fontLarge") },
          ]}
          value={system.fontSize}
          onChange={(val) =>
            updateSystemSettings({
              fontSize: val as AppSettings["system"]["fontSize"],
            })
          }
        />
      </section>

      {/* System Prompt */}
      <section className="space-y-4">
        <h3
          id="system-prompt-heading"
          className="text-lg font-semibold text-gray-800 dark:text-foreground"
        >
          {t("systemPrompt")}
        </h3>
        <div className="space-y-2">
          <p
            id="system-prompt-description"
            className="text-xs text-gray-500 dark:text-muted-foreground"
          >
            {t.rich("systemPromptDesc", {
              code: () => <code>{`<user-system-prompt>`}</code>,
            })}
          </p>
          <textarea
            name="systemPrompt"
            aria-labelledby="system-prompt-heading"
            aria-describedby="system-prompt-description"
            value={system.systemPrompt}
            onChange={(e) =>
              updateSystemSettings({ systemPrompt: e.target.value })
            }
            maxLength={SYSTEM_SETTINGS_LIMITS.maxSystemPromptChars}
            autoComplete="off"
            spellCheck={false}
            className="w-full h-32 p-3 bg-white dark:bg-muted border border-gray-200 dark:border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-mono custom-scrollbar resize-none text-gray-700 dark:text-foreground"
            placeholder={t("systemPromptPlaceholder")}
          />
        </div>
      </section>

      {/* Advanced Parameters */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground">
          {t("advancedParameters")}
        </h3>
        <div className="bg-gray-50/50 dark:bg-muted/30 border border-gray-200 dark:border-border rounded-xl divide-y divide-gray-100 dark:divide-border">
          {/* Auto Title */}
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-foreground">
                {t("autoTitle")}
              </div>
              <div className="text-xs text-gray-500 dark:text-muted-foreground">
                {t("autoTitleDesc")}
              </div>
            </div>
            <SimpleSwitch
              ariaLabel={t("autoTitleAria")}
              name="enableAutoTitle"
              checked={system.enableAutoTitle}
              onChange={() =>
                updateSystemSettings({
                  enableAutoTitle: !system.enableAutoTitle,
                })
              }
            />
          </div>

          {/* Related Questions */}
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-foreground">
                {t("relatedQuestions")}
              </div>
              <div className="text-xs text-gray-500 dark:text-muted-foreground">
                {t("relatedQuestionsDesc")}
              </div>
            </div>
            <SimpleSwitch
              ariaLabel={t("relatedQuestionsAria")}
              name="enableRelatedQuestions"
              checked={system.enableRelatedQuestions}
              onChange={() =>
                updateSystemSettings({
                  enableRelatedQuestions: !system.enableRelatedQuestions,
                })
              }
            />
          </div>

          {/* Auto Collapse Code */}
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-foreground">
                {t("autoCollapseCode")}
              </div>
              <div className="text-xs text-gray-500 dark:text-muted-foreground">
                {t("autoCollapseCodeDesc")}
              </div>
            </div>
            <SimpleSwitch
              ariaLabel={t("autoCollapseCodeAria")}
              name="enableCodeCollapse"
              checked={system.enableCodeCollapse}
              onChange={() =>
                updateSystemSettings({
                  enableCodeCollapse: !system.enableCodeCollapse,
                })
              }
            />
          </div>

          {/* HTML Visual Prompt */}
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-foreground">
                {t("htmlVisualPrompt")}
              </div>
              <div className="text-xs text-gray-500 dark:text-muted-foreground">
                {t("htmlVisualPromptDesc")}
              </div>
            </div>
            <SimpleSwitch
              ariaLabel={t("htmlVisualPromptAria")}
              name="enableHtmlVisualPrompt"
              checked={system.enableHtmlVisualPrompt}
              onChange={() =>
                updateSystemSettings({
                  enableHtmlVisualPrompt: !system.enableHtmlVisualPrompt,
                })
              }
            />
          </div>

          {/* Context Compression */}
          <div className="flex flex-col p-4 gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-foreground">
                  {t("autoCompress")}
                </div>
                <div className="text-xs text-gray-500 dark:text-muted-foreground">
                  {t("autoCompressDesc")}
                </div>
              </div>
              <SimpleSwitch
                ariaLabel={t("autoCompressAria")}
                name="enableAutoCompression"
                checked={system.enableAutoCompression}
                onChange={() =>
                  updateSystemSettings({
                    enableAutoCompression: !system.enableAutoCompression,
                  })
                }
              />
            </div>

            {system.enableAutoCompression && (
              <div className="pl-4 pr-2 space-y-4 animate-in slide-in-from-top-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-muted-foreground">
                    <label
                      htmlFor="compression-threshold"
                      className="font-medium"
                    >
                      {t("compressionThreshold")}
                    </label>
                    <span className="font-mono">
                      {system.compressionThreshold}
                    </span>
                  </div>
                  <input
                    id="compression-threshold"
                    name="compressionThreshold"
                    type="range"
                    min={SYSTEM_SETTINGS_LIMITS.minCompressionThreshold}
                    max={SYSTEM_SETTINGS_LIMITS.maxCompressionThreshold}
                    step="1"
                    value={system.compressionThreshold}
                    onChange={(e) =>
                      updateSystemSettings({
                        compressionThreshold: parseInt(e.target.value, 10),
                      })
                    }
                    aria-describedby="compression-threshold-bounds"
                    className="w-full h-1.5 bg-gray-200 dark:bg-accent rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <div
                    id="compression-threshold-bounds"
                    className="flex justify-between text-[10px] text-gray-400"
                  >
                    <span>
                      {SYSTEM_SETTINGS_LIMITS.minCompressionThreshold}
                    </span>
                    <span>
                      {SYSTEM_SETTINGS_LIMITS.maxCompressionThreshold}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-muted-foreground">
                    <label htmlFor="history-keep-count" className="font-medium">
                      {t("keepHistory")}
                    </label>
                    <span className="font-mono">{system.historyKeepCount}</span>
                  </div>
                  <input
                    id="history-keep-count"
                    name="historyKeepCount"
                    type="range"
                    min={SYSTEM_SETTINGS_LIMITS.minHistoryKeepCount}
                    max={SYSTEM_SETTINGS_LIMITS.maxHistoryKeepCount}
                    step="1"
                    value={system.historyKeepCount}
                    onChange={(e) =>
                      updateSystemSettings({
                        historyKeepCount: parseInt(e.target.value, 10),
                      })
                    }
                    aria-describedby="history-keep-count-bounds"
                    className="w-full h-1.5 bg-gray-200 dark:bg-accent rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <div
                    id="history-keep-count-bounds"
                    className="flex justify-between text-[10px] text-gray-400"
                  >
                    <span>{SYSTEM_SETTINGS_LIMITS.minHistoryKeepCount}</span>
                    <span>{SYSTEM_SETTINGS_LIMITS.maxHistoryKeepCount}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Data Management */}
      <section className="space-y-4 pt-4 border-t border-gray-100 dark:border-border">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground">
          {t("dataManagement")}
        </h3>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-border dark:bg-card">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium text-gray-800 dark:text-foreground">
                {t("exportAllData")}
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">
                {t("exportAllDataDesc")}
              </div>
            </div>
            <button
              type="button"
              onClick={handleExportAllData}
              disabled={isExportingData}
              aria-busy={isExportingData}
              aria-label={t("exportAria")}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              {isExportingData ? (
                <Loader2
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Download size={14} aria-hidden="true" />
              )}
              {isExportingData ? t("exporting") : t("exportData")}
            </button>
          </div>
          {exportDataError ? (
            <div
              role="alert"
              aria-live="polite"
              className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
            >
              {exportDataError}
            </div>
          ) : null}
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-4 pt-4 border-t border-gray-100 dark:border-border">
        <h3 className="text-lg font-semibold text-red-600">
          {t("dangerZone")}
        </h3>
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-red-800 dark:text-red-300">
                {t("clearAllData")}
              </div>
              <div className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">
                {t("clearAllDataDesc")}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearAllData}
              disabled={isClearingData}
              aria-busy={isClearingData}
              aria-label={
                isClearConfirming ? t("clearConfirmAria") : t("clearAria")
              }
              className="inline-flex items-center gap-2 bg-white dark:bg-muted border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white dark:hover:text-white disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-muted disabled:hover:text-red-600 dark:disabled:hover:text-red-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
            >
              {isClearingData && (
                <Loader2
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {isClearingData
                ? t("clearing")
                : isClearConfirming
                  ? t("confirmClear")
                  : t("clearData")}
            </button>
          </div>
          {isClearConfirming && !isClearingData ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
            >
              {t("clearConfirmHint")}
            </div>
          ) : null}
          {clearDataError ? (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
            >
              {clearDataError}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default SystemSettings;
