"use client";
import React from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Tooltip from "../ui/Tooltip";

interface SidebarSearchProps {
  isOpen: boolean;
  onOpenGlobalSearch: () => void;
  isGlobalSearchOpen: boolean;
}

const SidebarSearch: React.FC<SidebarSearchProps> = ({
  isOpen,
  onOpenGlobalSearch,
  isGlobalSearchOpen,
}) => {
  const t = useTranslations("Sidebar");

  return (
    <div className="px-3 pb-2 shrink-0">
      <Tooltip
        content={t("globalSearch")}
        position="right"
        className={isOpen ? "w-full" : "w-full justify-center"}
      >
        <button
          type="button"
          aria-label={t("openGlobalSearch")}
          aria-current={isGlobalSearchOpen ? "page" : undefined}
          onClick={onOpenGlobalSearch}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-[color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
            isGlobalSearchOpen
              ? "bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400"
              : "text-gray-600 dark:text-muted-foreground hover:bg-gray-100/80 dark:hover:bg-muted/60"
          } ${isOpen ? "w-full" : "w-10 justify-center px-0"}`}
        >
          <Search
            size={18}
            className={`shrink-0 ${isGlobalSearchOpen ? "text-cyan-500" : "text-gray-500"}`}
            aria-hidden="true"
          />
          {isOpen && <span className="truncate">{t("globalSearch")}</span>}
        </button>
      </Tooltip>
    </div>
  );
};

export default SidebarSearch;
