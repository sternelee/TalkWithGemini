import React from "react";
import {
  MessageSquarePlus,
  MessageSquareQuote,
  FoldVertical,
  Sparkles,
  Search,
  Brain,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSettingsStore, formatModelName } from "@/store/core/settingsStore";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { useDefaultModels } from "@/store/hooks/useShallowStore";
import { CustomSelect, GroupedSelectOption } from "./SettingsUI";
import { DefaultModels } from "@/types";
import { getDefaultModelSelectValue } from "@/lib/utils/defaultModels";

const DefaultModelSettings = () => {
  const t = useTranslations("DefaultModels");
  const { modelMetadata, customModelMetadata } = useSettingsStore();
  const { providers } = useCoreSettingsStore();
  const { defaultModels, updateDefaultModels } = useDefaultModels();

  // Aggregate all enabled models, grouped by Provider
  const groupedOptions: GroupedSelectOption[] = React.useMemo(() => {
    return providers
      .filter((p) => p.enabled && p.models.length > 0)
      .map((p) => ({
        label: p.name,
        options: p.models.map((mId) => {
          const displayName = formatModelName(
            mId,
            modelMetadata,
            customModelMetadata,
          );
          return {
            value: `${p.id}:${mId}`,
            label: displayName,
          };
        }),
      }));
  }, [providers, modelMetadata, customModelMetadata]);

  // Helper to ensure we show a valid value. If state is empty or invalid, show the calculated default.
  // However, we want to allow the user to see what is *actually* selected in state vs what is falling back.
  // For the UI, if the state value is empty, we can show the calculated one as the "value" passed to CustomSelect,
  // effectively pre-selecting it visually.
  const getEffectiveValue = (taskKey: keyof DefaultModels) => {
    // If stored value exists and is valid (part of current options), return it.
    // If not, return the calculated fallback.
    // Note: getTaskModel already handles the "if stored is valid" check.
    return getDefaultModelSelectValue(defaultModels, taskKey, providers);
  };

  const renderSettingRow = (
    icon: React.ReactNode,
    label: string,
    description: string,
    valueKey: keyof DefaultModels,
    colorClass: string,
  ) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-gray-50/50 dark:bg-muted/30 border border-gray-200 dark:border-border rounded-xl gap-4">
      <div className="flex items-start gap-3 flex-1">
        <div className={`p-2 rounded-lg ${colorClass} bg-opacity-10 shrink-0`}>
          {icon}
        </div>
        <div>
          <div className="font-medium text-sm text-gray-800 dark:text-foreground">
            {label}
          </div>
          <div className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5 leading-relaxed">
            {description}
          </div>
        </div>
      </div>
      <div className="w-full md:w-64 shrink-0">
        <CustomSelect
          ariaLabel={t("defaultModelForAria", { label })}
          value={getEffectiveValue(valueKey)}
          onChange={(val) => updateDefaultModels({ [valueKey]: val })}
          options={groupedOptions}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground">
          {t("title")}
        </h3>
        <p className="text-xs text-gray-500 dark:text-muted-foreground mt-1">
          {t("subtitle")}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {renderSettingRow(
          <MessageSquareQuote
            size={18}
            className="text-blue-500"
            aria-hidden="true"
          />,
          t("conversationTitle"),
          t("conversationTitleDesc"),
          "titleGeneration",
          "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
        )}

        {renderSettingRow(
          <MessageSquarePlus
            size={18}
            className="text-green-500"
            aria-hidden="true"
          />,
          t("relatedQuestions"),
          t("relatedQuestionsDesc"),
          "relatedQuestions",
          "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400",
        )}

        {renderSettingRow(
          <FoldVertical
            size={18}
            className="text-orange-500"
            aria-hidden="true"
          />,
          t("contextCompression"),
          t("contextCompressionDesc"),
          "contextCompression",
          "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
        )}

        {renderSettingRow(
          <Sparkles size={18} className="text-purple-500" aria-hidden="true" />,
          t("promptOptimization"),
          t("promptOptimizationDesc"),
          "promptOptimization",
          "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
        )}

        {renderSettingRow(
          <Search size={18} className="text-pink-500" aria-hidden="true" />,
          t("ragQuery"),
          t("ragQueryDesc"),
          "ragQuery",
          "bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400",
        )}

        {renderSettingRow(
          <Brain size={18} className="text-cyan-500" aria-hidden="true" />,
          t("memory"),
          t("memoryDesc"),
          "memory",
          "bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400",
        )}
      </div>
    </div>
  );
};

export default DefaultModelSettings;
