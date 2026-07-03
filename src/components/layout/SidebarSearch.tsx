"use client";
import React from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Tooltip from "../ui/Tooltip";

interface SidebarSearchProps {
  isOpen: boolean;
  inputId: string;
  inputRef: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  onCollapsedSearchClick: () => void;
}

const SidebarSearch: React.FC<SidebarSearchProps> = ({
  isOpen,
  inputId,
  inputRef,
  value,
  onChange,
  onCollapsedSearchClick,
}) => {
  const t = useTranslations("Sidebar");

  return (
    <div className="px-3 pb-2 shrink-0">
      {isOpen ? (
        <div className="relative animate-in fade-in duration-300">
          <Search
            className="absolute left-3 top-2.5 text-gray-400"
            size={16}
            aria-hidden="true"
          />
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            name="sidebar-chat-search"
            aria-label={t("searchChats")}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("searchChatsPlaceholder")}
            className="w-full rounded-lg border border-gray-200/50 bg-white/40 py-2 pl-9 pr-3 text-sm text-gray-700 transition-[border-color,box-shadow,background-color] placeholder-gray-500 focus:bg-white/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-border dark:bg-muted/40 dark:text-foreground dark:focus:bg-muted/60"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      ) : (
        <Tooltip
          content={t("search")}
          position="right"
          className="justify-center"
        >
          <button
            type="button"
            aria-label={t("searchChats")}
            onClick={onCollapsedSearchClick}
            className="flex items-center justify-center rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:hover:bg-muted/60"
          >
            <Search size={18} aria-hidden="true" />
          </button>
        </Tooltip>
      )}
    </div>
  );
};

export default SidebarSearch;
