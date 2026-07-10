"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import Sidebar from "@/components/layout/Sidebar";
import MessageItem from "@/components/chat/MessageItem";
import MessageInput, { MessageInputRef } from "@/components/chat/MessageInput";
import AssistantHeader from "@/components/assistant/AssistantHeader";
import Tooltip from "@/components/ui/Tooltip";
import FollowUpQuestions from "@/components/chat/FollowUpQuestions";
import { Logo } from "@/components/ui/Icons";
import type { ModelInfo } from "@/services/api/chatService";
import type { ChatPanel, SettingsTabId } from "@/lib/chat/panelUrlState";
import type {
  Attachment,
  LobeAgent,
  Message,
  Session,
  SessionMessageTree,
} from "@/types";
import { getMessageBranchInfo } from "@/lib/chat/messageTree";

const ImagePreview = dynamic(() => import("@/components/media/ImagePreview"), {
  ssr: false,
});
const PluginMarket = dynamic(() => import("@/components/plugin/PluginMarket"), {
  ssr: false,
});
const SkillMarket = dynamic(() => import("@/components/skill/SkillMarket"), {
  ssr: false,
});
const AssistantHub = dynamic(
  () => import("@/components/assistant/AssistantHub"),
  {
    ssr: false,
  },
);
const KnowledgeBase = dynamic(
  () => import("@/components/knowledge/KnowledgeBase"),
  {
    ssr: false,
  },
);
const SettingsPage = dynamic(
  () => import("@/components/settings/SettingsPage"),
  {
    ssr: false,
  },
);

type WelcomeState = "visible" | "exiting" | "hidden";
type MessageInputVariant = "default" | "hero";

interface ChatAppShellProps {
  actionError: string | null;
  sessions: Session[];
  currentSessionId: string | null;
  currentSession?: Session;
  messages: Message[];
  activeMessageTree: SessionMessageTree;
  isGenerating: boolean;
  isActiveSessionLoading: boolean;
  availableModels: ModelInfo[];
  selectedModel: string;
  isSearchEnabled: boolean;
  viewMode: ChatPanel;
  settingsTab: SettingsTabId;
  isSidebarOpen: boolean;
  isNonDesktopViewport: boolean;
  isSidebarDrawerOpen: boolean;
  mainInertProps: React.HTMLAttributes<HTMLElement> & { inert?: boolean };
  shouldShowChatTitleBar: boolean;
  welcomeState: WelcomeState;
  messageInputVariant: MessageInputVariant;
  messagesScrollRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messageInputRef: React.RefObject<MessageInputRef | null>;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToPanel: (
    panel: ChatPanel,
    nextSettingsTab?: SettingsTabId | null,
    historyMode?: "push" | "replace",
  ) => void;
  handleSettingsTabChange: (tab: SettingsTabId) => void;
  updateIsNearMessageBottom: () => void;
  stopActiveGenerationWithFeedback: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  handleNewChat: () => void;
  handleDeleteSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (id: string, title: string) => void;
  toggleSessionPin: (id: string) => void;
  handleDuplicateSession: (sessionId: string) => Promise<void>;
  handleSmartRename: (sessionId: string) => Promise<void>;
  handleAssistantSelect: (agent: LobeAgent) => Promise<void>;
  updateSessionInstruction: (id: string, instruction: string) => void;
  handleEditMessage: (msgId: string, newContent: string) => void;
  handleDeleteMessage: (msgId: string) => Promise<void>;
  handleSubmitUserMessageEdit: (
    msgId: string,
    newContent: string,
  ) => Promise<void>;
  handleRetractMessage: (msg: Message) => Promise<void>;
  handleRegenerate: (messageId: string) => Promise<void>;
  handleVersionChange: (msgId: string, direction: "prev" | "next") => void;
  handleSendMessage: (text: string, attachments: Attachment[]) => Promise<void>;
  handleSuggestionClick: (question: string) => void;
  handleStopGeneration: () => void;
  setModel: (model: string) => void;
  onToggleSearch: () => void;
}

const ChatAppShell = ({
  actionError,
  sessions,
  currentSessionId,
  currentSession,
  messages,
  activeMessageTree,
  isGenerating,
  isActiveSessionLoading,
  availableModels,
  selectedModel,
  isSearchEnabled,
  viewMode,
  settingsTab,
  isSidebarOpen,
  isNonDesktopViewport,
  isSidebarDrawerOpen,
  mainInertProps,
  shouldShowChatTitleBar,
  welcomeState,
  messageInputVariant,
  messagesScrollRef,
  messagesEndRef,
  messageInputRef,
  setIsSidebarOpen,
  navigateToPanel,
  handleSettingsTabChange,
  updateIsNearMessageBottom,
  stopActiveGenerationWithFeedback,
  selectSession,
  handleNewChat,
  handleDeleteSession,
  updateSessionTitle,
  toggleSessionPin,
  handleDuplicateSession,
  handleSmartRename,
  handleAssistantSelect,
  updateSessionInstruction,
  handleEditMessage,
  handleDeleteMessage,
  handleSubmitUserMessageEdit,
  handleRetractMessage,
  handleRegenerate,
  handleVersionChange,
  handleSendMessage,
  handleSuggestionClick,
  handleStopGeneration,
  setModel,
  onToggleSearch,
}: ChatAppShellProps) => {
  const t = useTranslations("ChatApp");
  let lastUserMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      lastUserMessageIndex = index;
      break;
    }
  }

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background font-sans text-foreground transition-colors duration-300">
      <a className="skip-link" href="#main-chat">
        {t("skipToChat")}
      </a>
      <ImagePreview />

      {isSidebarDrawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/10 transition-opacity duration-200 dark:bg-black/50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => {
          if (isGenerating) {
            void stopActiveGenerationWithFeedback();
          }
          void selectSession(id);
          navigateToPanel("chat");
        }}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={updateSessionTitle}
        onTogglePin={toggleSessionPin}
        onDuplicate={handleDuplicateSession}
        isDuplicateDisabled={isGenerating || isActiveSessionLoading}
        onSmartRename={handleSmartRename}
        isOpen={isSidebarOpen}
        isHidden={isNonDesktopViewport && !isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen((open) => !open)}
        isModal={isSidebarDrawerOpen}
        onRequestClose={() => setIsSidebarOpen(false)}
        onOpenPluginMarket={() => navigateToPanel("plugins")}
        isPluginMarketOpen={viewMode === "plugins"}
        onOpenSkillMarket={() => navigateToPanel("skills")}
        isSkillMarketOpen={viewMode === "skills"}
        onOpenAssistantHub={() => navigateToPanel("assistants")}
        isAssistantHubOpen={viewMode === "assistants"}
        onOpenKnowledgeBase={() => navigateToPanel("knowledge")}
        isKnowledgeBaseOpen={viewMode === "knowledge"}
        onOpenSettings={() => navigateToPanel("settings", "system")}
        isSettingsOpen={viewMode === "settings"}
        onLogoClick={() => navigateToPanel("chat")}
      />

      <main
        {...mainInertProps}
        id="main-chat"
        tabIndex={-1}
        className="flex-1 flex flex-col h-full relative z-0 min-w-0 overflow-hidden"
      >
        {actionError && (
          <div
            role="alert"
            className="absolute top-16 left-4 right-4 z-30 pointer-events-none"
          >
            <div className="mx-auto max-w-3xl rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/90 dark:text-red-100">
              {actionError}
            </div>
          </div>
        )}
        {viewMode === "plugins" ? (
          <PluginMarket onClose={() => navigateToPanel("chat")} />
        ) : viewMode === "skills" ? (
          <SkillMarket onClose={() => navigateToPanel("chat")} />
        ) : viewMode === "assistants" ? (
          <AssistantHub
            onClose={() => navigateToPanel("chat")}
            onSelect={handleAssistantSelect}
          />
        ) : viewMode === "knowledge" ? (
          <KnowledgeBase onClose={() => navigateToPanel("chat")} />
        ) : viewMode === "settings" ? (
          <SettingsPage
            activeTab={settingsTab}
            onTabChange={handleSettingsTabChange}
            onClose={() => navigateToPanel("chat")}
          />
        ) : (
          <>
            <header className="relative z-10 flex h-14 items-center justify-between px-4 md:px-6">
              <div className="flex min-w-10 items-center">
                <Tooltip
                  content={isSidebarOpen ? t("closeSidebar") : t("openSidebar")}
                  position="right"
                  className="lg:hidden"
                >
                  <button
                    type="button"
                    aria-label={
                      isSidebarOpen
                        ? t("closeSidebarAria")
                        : t("openSidebarAria")
                    }
                    onClick={() => setIsSidebarOpen((open) => !open)}
                    className="p-2 -ml-2 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {isSidebarOpen ? (
                      <PanelLeftClose size={16} aria-hidden="true" />
                    ) : (
                      <PanelLeftOpen size={16} aria-hidden="true" />
                    )}
                  </button>
                </Tooltip>
              </div>

              {shouldShowChatTitleBar && (
                <div className="absolute left-1/2 top-1/2 max-w-[50%] -translate-x-1/2 -translate-y-1/2 truncate text-center font-bold text-foreground">
                  {currentSession?.title || t("newChat")}
                </div>
              )}

              <div className="flex items-center justify-end min-w-10">
                {!isSidebarOpen && (
                  <Tooltip content={t("newChat")} position="left">
                    <button
                      type="button"
                      aria-label={t("newChatAria")}
                      onClick={handleNewChat}
                      className="p-2 -mr-2 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <MessageSquarePlus size={16} aria-hidden="true" />
                    </button>
                  </Tooltip>
                )}
              </div>
            </header>

            <div
              ref={messagesScrollRef}
              onScroll={updateIsNearMessageBottom}
              className="flex-1 px-4 md:px-8 pt-4 md:pt-6 pb-[calc(8rem+env(safe-area-inset-bottom))] relative motion-safe:scroll-smooth scrollbar-overlay"
            >
              <div className="w-full max-w-3xl mx-auto min-h-full flex flex-col">
                {currentSession &&
                  (messages.length > 0 ||
                    !!currentSession.systemInstruction) && (
                    <AssistantHeader
                      instruction={currentSession.systemInstruction || ""}
                      onUpdate={(newInst) =>
                        updateSessionInstruction(currentSession.id, newInst)
                      }
                      onDelete={
                        currentSession.systemInstruction
                          ? () =>
                              updateSessionInstruction(currentSession.id, "")
                          : undefined
                      }
                    />
                  )}

                {(welcomeState === "visible" || welcomeState === "exiting") && (
                  <div
                    className={`emptyChatSurface flex-1 motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:transform origin-center ${
                      welcomeState === "exiting"
                        ? "opacity-0 scale-95 pointer-events-none"
                        : "opacity-100 scale-100"
                    }`}
                  />
                )}

                {welcomeState === "hidden" && (
                  <div className="space-y-1 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 fill-mode-forwards">
                    {messages.map((msg, idx) => {
                      const isLastUserMessage =
                        msg.role === "user" && idx === lastUserMessageIndex;
                      const isLastMessage = idx === messages.length - 1;

                      return (
                        <React.Fragment key={msg.id}>
                          <div className="[content-visibility:auto] [contain-intrinsic-size:0_240px]">
                            <MessageItem
                              message={msg}
                              actionsDisabled={isActiveSessionLoading}
                              branchInfo={getMessageBranchInfo(
                                activeMessageTree,
                                msg.id,
                              )}
                              onEdit={handleEditMessage}
                              onDelete={handleDeleteMessage}
                              canEditUserMessage={
                                msg.role === "user" && !isLastUserMessage
                              }
                              onSubmitUserEdit={handleSubmitUserMessageEdit}
                              onRetract={
                                isLastUserMessage
                                  ? () => handleRetractMessage(msg)
                                  : undefined
                              }
                              isLast={isLastMessage}
                              isTyping={isGenerating && isLastMessage}
                              onRegenerate={() => handleRegenerate(msg.id)}
                              onVersionChange={handleVersionChange}
                            />
                          </div>
                          {msg.role === "model" &&
                            isLastMessage &&
                            !isGenerating &&
                            msg.suggestedQuestions &&
                            msg.suggestedQuestions.length > 0 && (
                              <FollowUpQuestions
                                questions={msg.suggestedQuestions}
                                onClick={handleSuggestionClick}
                              />
                            )}
                        </React.Fragment>
                      );
                    })}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </div>

            <div className="w-full h-4 md:h-6"></div>

            <div
              className={`absolute left-0 right-0 z-20 px-4 pointer-events-none md:px-8 motion-safe:transition-[bottom,padding-bottom] motion-safe:duration-300 ${
                welcomeState === "visible"
                  ? "bottom-[40vh] pb-0 md:bottom-[32vh] md:pb-0"
                  : "bottom-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6"
              }`}
            >
              <div
                className={`flex w-full mx-auto pointer-events-auto flex-col items-center motion-safe:transition-[max-width] motion-safe:duration-300 ${
                  welcomeState === "visible" ? "max-w-2xl" : "max-w-3xl"
                }`}
              >
                {(welcomeState === "visible" || welcomeState === "exiting") && (
                  <div
                    className={`mb-3 md:mb-5 flex items-center gap-3 text-center motion-safe:transition-[opacity,transform] motion-safe:duration-300 ${
                      welcomeState === "exiting"
                        ? "pointer-events-none opacity-0 scale-95"
                        : "opacity-100 scale-100"
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center md:h-11 md:w-11">
                      <Logo className="h-10 w-10 md:h-11 md:w-11" />
                    </div>
                    <h1 className="neoChatWordmark bg-clip-text text-[1.75rem] font-bold leading-none tracking-[0.01em] text-transparent bg-[linear-gradient(to_right,#00DEB9,#03B2DE,#1D88E1)]">
                      {t("productName")}
                    </h1>
                  </div>
                )}
                <MessageInput
                  ref={messageInputRef}
                  variant={messageInputVariant}
                  onSend={handleSendMessage}
                  onStop={isGenerating ? handleStopGeneration : undefined}
                  disabled={
                    isGenerating ||
                    isActiveSessionLoading ||
                    availableModels.length === 0
                  }
                  availableModels={availableModels}
                  selectedModel={selectedModel}
                  onSelectModel={setModel}
                  isSearchEnabled={isSearchEnabled}
                  onToggleSearch={onToggleSearch}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default ChatAppShell;
