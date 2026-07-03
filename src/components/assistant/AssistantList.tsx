import React from "react";
import { useTranslations } from "next-intl";
import { LobeAgent } from "@/types";
import { BotMessageSquare, RefreshCw } from "lucide-react";
import SafeImage from "@/components/ui/SafeImage";

interface AssistantListProps {
  agents: LobeAgent[];
  onSelect: (agent: LobeAgent) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const AssistantList: React.FC<AssistantListProps> = ({
  agents,
  onSelect,
  onRefresh,
  isRefreshing,
}) => {
  const t = useTranslations("Assistant");
  const renderAvatar = (agent: LobeAgent) => {
    const avatar = agent.meta.avatar;
    // Simple check if string is likely a URL
    const isUrl =
      avatar.startsWith("http") ||
      avatar.startsWith("data:") ||
      avatar.includes("/");

    if (isUrl) {
      return (
        <SafeImage
          src={avatar}
          alt={t("avatarAlt", { title: agent.meta.title })}
          className="w-4 h-4 object-cover rounded-lg"
          fallback={
            <BotMessageSquare
              size={16}
              className="text-gray-400"
              aria-hidden="true"
            />
          }
        />
      );
    }
    return <span>{avatar}</span>;
  };

  return (
    <div className="w-full">
      {/* Assistant Recommendation Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-gray-700 dark:text-foreground/85 font-semibold text-sm">
          <BotMessageSquare
            size={16}
            className="text-red-500"
            aria-hidden="true"
          />
          <span>{t("listHeading")}</span>
        </div>
        <button
          type="button"
          aria-label={t("refreshRecommendationsAria")}
          aria-busy={isRefreshing}
          disabled={isRefreshing}
          onClick={onRefresh}
          className="p-1.5 text-gray-500 dark:text-muted-foreground hover:text-gray-800 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-muted rounded-lg transition-[color,background-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
        >
          <RefreshCw
            size={14}
            aria-hidden="true"
            className={`${isRefreshing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
        {agents.length > 0
          ? agents.map((agent) => (
              <button
                type="button"
                key={agent.identifier}
                aria-label={t("selectAssistantAria", {
                  title: agent.meta.title,
                })}
                className="group p-2 bg-white/60 dark:bg-muted/60 backdrop-blur-md border border-gray-200 dark:border-border rounded-xl hover:border-red-200/70 dark:hover:border-red-900/50 transition-[border-color,background-color,box-shadow] flex flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                onClick={() => onSelect(agent)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center overflow-hidden">
                    {renderAvatar(agent)}
                  </div>
                  <h3 className="font-semibold text-sm text-gray-800 dark:text-foreground group-hover:text-red-500 transition-colors truncate">
                    {agent.meta.title}
                  </h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted-foreground line-clamp-2 leading-relaxed h-9">
                  {agent.meta.description}
                </p>
              </button>
            ))
          : // Loading Skeletons
            [1, 2, 3, 4].map((i) => (
              <div
                key={i}
                aria-hidden="true"
                className="p-3 bg-white/50 dark:bg-muted/50 backdrop-blur-md rounded-xl flex flex-col gap-2 animate-pulse border border-gray-200 dark:border-border"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-accent rounded-lg"></div>
                  <div className="h-4 bg-gray-200 dark:bg-accent rounded w-1/2"></div>
                </div>
                <div className="h-2.5 bg-gray-200 dark:bg-accent rounded w-full mt-1"></div>
                <div className="h-2.5 bg-gray-200 dark:bg-accent rounded w-2/3"></div>
              </div>
            ))}
      </div>
    </div>
  );
};

export default AssistantList;
