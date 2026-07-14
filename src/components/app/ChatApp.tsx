"use client";
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { v7 as uuidv7 } from "uuid";

import ChatAppShell from "@/components/app/ChatAppShell";
import type { MessageInputRef } from "@/components/chat/MessageInput";
import type { ModelInfo } from "@/services/api/chatService";
import { resolveSkillsForMessage } from "@/services/api/skillService";
import {
  buildProviderRuntimeConfig,
  fetchWithByokRetry,
} from "@/lib/byok/client";
import { getAgentDetail } from "@/services/api/agentService";
import { Message, Attachment, LobeAgent, SessionMessageTree } from "@/types";
import { useChatStore } from "@/store/core/chatStore";
import { useMemoryStore } from "@/store/core/memoryStore";
import { appDb } from "@/store/storage/storageConfig";
import { formatModelName } from "@/store/core/settingsStore";
import { handleTokenUsageUpdate } from "@/lib/utils/message";
import { buildAvailableModels, resolveSelectedModel } from "@/lib/utils/models";
import {
  processMessageForSending,
  createBotMessagePlaceholder,
  getModelDisplayName,
} from "@/lib/chat/messageProcessor";
import {
  createSessionPostGenerationSnapshot,
  shouldAbortActiveGenerationForSessionDelete,
  shouldApplyCompressionUpdate,
  shouldApplyGeneratedTitle,
  shouldApplyRequestedTitle,
  shouldApplySuggestedQuestions,
} from "@/lib/chat/postGenerationGuards";
import {
  useChatGenerationController,
  useChatPanelNavigation,
  useChatShellState,
  useChatThemeEffects,
  useWelcomeChatState,
  useWorkspaceAttachmentHydration,
} from "@/features/chat";
import { resolveEffectiveChatContext } from "@/lib/chat/effectiveChatContext";
import { resolveEffectiveChatRequestConfig } from "@/lib/chat/effectiveChatConfig";
import { buildDirectMemoryPromptContext } from "@/lib/memory/entities";
import { getSuppressedMemoryIds } from "@/lib/memory/compression";
import { appendContextToChatInput } from "@/lib/utils/chatInput";
import {
  getActiveMessagePath,
  normalizeSessionMessageTree,
} from "@/lib/chat/messageTree";
import { normalizeActivePluginIds } from "@/lib/plugin/config";
import { parseModelString } from "@/lib/utils/model";
import { logDevError } from "@/lib/utils/devLogger";
import {
  PublicServerConfig,
  SERVER_DEFAULT_PROVIDER_ID,
} from "@/lib/defaultConfig/shared";
import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
  signedApiFetch,
} from "@/lib/api/client";
import {
  getSessionPluginPresetSyncKey,
  shouldDisableSearchToggle,
  shouldApplySessionPluginPreset,
  shouldResolveSelectedModelAfterBootstrap,
  shouldRunSettingsStartupEffects,
} from "@/lib/app/startupEffects";
import { buildSearchUpdate } from "@/lib/chat/searchUpdate";
import { getSearchCompatibility } from "@/lib/settings/searchRag";

const logChatAppError = logDevError;
const EMPTY_MESSAGES: Message[] = [];
const loadChatService = () => import("@/services/api/chatService");

const ChatApp = () => {
  // --- Global Store ---
  const {
    chat: {
      _hasHydrated: chatHasHydrated,
      sessions,
      workspaces,
      currentSessionId,
      activeMessages,
      activeMessageTree,
      isActiveSessionLoading,
      activeSessionLoadError,
      selectedModel,
      chatConfig,
      createSession,
      selectSession,
      deleteSession,
      updateSessionTitle,
      updateSessionInstruction,
      updateSessionCompression,
      updateSessionMemoryContext,
      toggleSessionPin,
      duplicateSession,
      addMessage,
      updateMessageContent,
      updateMessage,
      addMessageVersion,
      createEditedUserMessageBranch,
      switchMessageVersion,
      deleteMessage,
      deleteMessageAndSubsequent,
      setSuggestedQuestions,
      setModel,
      setChatConfig,
      getCurrentSession,
      syncActiveSession,
    },
    settings: {
      _hasHydrated,
      modelMetadata,
      customModelMetadata,
      fetchModelMetadata,
      ensureBuiltInPlugins,
      system,
      rag,
      search,
      activePlugins,
      installedPlugins,
      pluginConfigs,
      installedSkills,
      skillAutoSelect,
      setActivePlugins,
      applyServerConfig: applySettingsServerConfig,
    },
    core: {
      _hasHydrated: coreHasHydrated,
      theme,
      providers,
      updateProvider,
      applyServerConfig: applyCoreServerConfig,
    },
    knowledgeCollections,
  } = useChatShellState();

  const t = useTranslations("ChatApp");
  const locale = useLocale();

  // --- Local UI State ---
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    isGenerating,
    beginActiveGeneration,
    isGenerationRunActive,
    finishActiveGeneration,
    stopActiveGeneration,
  } = useChatGenerationController();
  const {
    viewMode,
    settingsTab,
    isSidebarOpen,
    isNonDesktopViewport,
    isSidebarDrawerOpen,
    mainInertProps,
    setIsSidebarOpen,
    navigateToPanel,
    handleSettingsTabChange,
  } = useChatPanelNavigation();

  const backgroundPostProcessControllerRef = useRef<AbortController | null>(
    null,
  );
  const abortBackgroundPostProcessing = useCallback(() => {
    backgroundPostProcessControllerRef.current?.abort();
    backgroundPostProcessControllerRef.current = null;
  }, []);
  const beginBackgroundPostProcessing = useCallback(() => {
    abortBackgroundPostProcessing();
    const controller = new AbortController();
    backgroundPostProcessControllerRef.current = controller;
    return controller.signal;
  }, [abortBackgroundPostProcessing]);

  const queueMemoryExtraction = useCallback(
    (
      sessionId: string,
      userMessage: Pick<Message, "id" | "content">,
      assistantMessage: Pick<Message, "id" | "content">,
      signal?: AbortSignal,
    ) => {
      loadChatService()
        .then(({ performBackgroundMemoryExtraction }) =>
          performBackgroundMemoryExtraction({
            sessionId,
            userMessage,
            assistantMessage,
            signal,
          }),
        )
        .catch((err) => {
          if (
            signal?.aborted ||
            (err instanceof Error && err.name === "AbortError")
          ) {
            return;
          }
          logChatAppError("Memory extraction failed:", err);
        });
    },
    [],
  );

  const [serverConfigResolved, setServerConfigResolved] = useState(false);
  const [serverModelBootstrapReady, setServerModelBootstrapReady] =
    useState(false);

  const availableModels = useMemo<ModelInfo[]>(() => {
    if (!_hasHydrated || !coreHasHydrated) return [];

    return buildAvailableModels(
      providers,
      modelMetadata,
      customModelMetadata,
      formatModelName,
    );
  }, [
    _hasHydrated,
    coreHasHydrated,
    providers,
    modelMetadata,
    customModelMetadata,
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const isNearMessageBottomRef = useRef(true);
  const messageInputRef = useRef<MessageInputRef>(null);
  const actionErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const assistantSelectRequestRef = useRef(0);
  const defaultProviderFetchRef = useRef(false);

  const currentSession = getCurrentSession(); // This is just metadata now
  const messages = activeMessages ?? EMPTY_MESSAGES; // Use activeMessages from store
  const currentSessionConfig = currentSession?.config;
  const currentSessionWorkspaceId = currentSession?.workspaceId;
  const selectedProvider = useMemo(() => {
    const { providerId } = parseModelString(selectedModel);
    return providerId
      ? providers.find((provider) => provider.id === providerId)
      : providers.find((provider) => provider.enabled);
  }, [providers, selectedModel]);
  const currentSearchCompatibility = useMemo(() => {
    const searchConfig =
      search.provider === "google"
        ? undefined
        : search.configs[search.provider];
    return getSearchCompatibility({
      searchProvider: search.provider,
      searchConfig,
      modelProviderType: selectedProvider?.type,
    });
  }, [search.configs, search.provider, selectedProvider?.type]);
  useChatThemeEffects(theme, system.fontSize);

  // Logic for Assistant List Animation
  const isChatEmpty =
    messages.length === 0 && !currentSession?.systemInstruction;
  const { welcomeState, messageInputVariant, shouldShowChatTitleBar } =
    useWelcomeChatState({
      currentSessionId,
      isChatEmpty,
    });
  const syncedSessionPluginPresetRef = useRef<string | null>(null);

  // --- Effects ---

  // Sync Global Plugins from Session Config
  useEffect(() => {
    const sessionPluginPreset = currentSessionConfig?.activePlugins;
    const sessionPlugins = normalizeActivePluginIds(
      sessionPluginPreset,
      installedPlugins,
      pluginConfigs,
      { unauthenticatedAllowedPluginIds: ["unsplash"] },
    );
    const presetSyncKey = getSessionPluginPresetSyncKey(
      currentSessionId,
      sessionPlugins,
    );

    if (
      !shouldApplySessionPluginPreset(
        _hasHydrated,
        chatHasHydrated,
        sessionPluginPreset,
        syncedSessionPluginPresetRef.current,
        presetSyncKey,
      )
    ) {
      return;
    }

    const sortedSession = [...sessionPlugins].sort();
    const sortedActive = [...activePlugins].sort();

    if (JSON.stringify(sortedSession) !== JSON.stringify(sortedActive)) {
      setActivePlugins(sessionPlugins);
    }
    syncedSessionPluginPresetRef.current = presetSyncKey;
  }, [
    activePlugins,
    chatHasHydrated,
    currentSessionId,
    currentSessionConfig,
    _hasHydrated,
    installedPlugins,
    pluginConfigs,
    setActivePlugins,
  ]);

  useWorkspaceAttachmentHydration({
    activeMessagesLength: activeMessages.length,
    currentSessionId,
    currentSessionWorkspaceId,
    inputRef: messageInputRef,
    workspaces,
  });

  // Fetch Metadata & Ensure Plugins on mount
  useEffect(() => {
    if (
      !shouldDisableSearchToggle({
        chatHydrated: chatHasHydrated,
        settingsHydrated: _hasHydrated,
        coreHydrated: coreHasHydrated,
        serverModelBootstrapReady,
        useSearch: chatConfig.useSearch,
        searchCompatibility: currentSearchCompatibility,
      })
    ) {
      return;
    }

    if (!currentSearchCompatibility.enabled) {
      setChatConfig({ useSearch: false });
    }
  }, [
    chatConfig.useSearch,
    chatHasHydrated,
    _hasHydrated,
    coreHasHydrated,
    currentSearchCompatibility,
    serverModelBootstrapReady,
    setChatConfig,
  ]);

  useEffect(() => {
    if (!shouldRunSettingsStartupEffects(_hasHydrated)) return;
    fetchModelMetadata();
    ensureBuiltInPlugins();
  }, [_hasHydrated, fetchModelMetadata, ensureBuiltInPlugins]);

  useEffect(() => {
    if (!coreHasHydrated || !_hasHydrated) return;

    let active = true;
    defaultProviderFetchRef.current = false;
    setServerConfigResolved(false);
    setServerModelBootstrapReady(false);

    const loadServerConfig = async () => {
      try {
        const response = await fetch("/api/config", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(
            await getResponseErrorMessage(response, "Failed to load config"),
          );
        }

        const config = await readJsonResponseOrThrow<PublicServerConfig>(
          response,
          "Failed to load config",
        );
        if (!active) return;

        applyCoreServerConfig(config);
        applySettingsServerConfig(config);
        setServerConfigResolved(true);
        if (
          !config.modelProvider.available ||
          config.modelProvider.models.length > 0
        ) {
          setServerModelBootstrapReady(true);
        }
      } catch (error) {
        logChatAppError("Failed to load server config", error);
        if (!active) return;
        setServerConfigResolved(true);
        setServerModelBootstrapReady(true);
      }
    };

    loadServerConfig();

    return () => {
      active = false;
    };
  }, [
    _hasHydrated,
    applyCoreServerConfig,
    applySettingsServerConfig,
    coreHasHydrated,
  ]);

  useEffect(() => {
    if (
      !coreHasHydrated ||
      !serverConfigResolved ||
      serverModelBootstrapReady
    ) {
      return;
    }

    const defaultProvider = providers.find(
      (provider) =>
        provider.id === SERVER_DEFAULT_PROVIDER_ID && provider.isServerDefault,
    );
    if (!defaultProvider) {
      setServerModelBootstrapReady(true);
      return;
    }
    if (
      defaultProvider.modelsList?.length ||
      defaultProvider.models.length > 0
    ) {
      setServerModelBootstrapReady(true);
      return;
    }
    if (defaultProviderFetchRef.current) return;

    let active = true;
    defaultProviderFetchRef.current = true;
    const providerSnapshot = defaultProvider;

    fetchWithByokRetry(async () =>
      signedApiFetch("/api/providers/models", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: await buildProviderRuntimeConfig(providerSnapshot),
        }),
      }),
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await getResponseErrorMessage(response, "Failed to fetch models"),
          );
        }
        return readJsonResponseOrThrow<{ models?: string[] }>(
          response,
          "Failed to fetch models",
        );
      })
      .then((data) => {
        const models = data.models || [];
        updateProvider(providerSnapshot.id, {
          models,
          modelsList: models,
        });
        if (active) {
          setServerModelBootstrapReady(true);
        }
      })
      .catch((error) => {
        logChatAppError("Failed to fetch default provider models", error);
        if (active) {
          setServerModelBootstrapReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [
    coreHasHydrated,
    providers,
    serverConfigResolved,
    serverModelBootstrapReady,
    updateProvider,
  ]);

  useEffect(() => {
    if (
      !shouldResolveSelectedModelAfterBootstrap({
        chatHydrated: chatHasHydrated,
        settingsHydrated: _hasHydrated,
        coreHydrated: coreHasHydrated,
        serverModelBootstrapReady,
      })
    ) {
      return;
    }

    const nextModel = resolveSelectedModel(
      availableModels,
      selectedModel,
      SERVER_DEFAULT_PROVIDER_ID,
    );

    if (selectedModel === nextModel) {
      return;
    }

    setModel(nextModel);
  }, [
    chatHasHydrated,
    _hasHydrated,
    coreHasHydrated,
    serverModelBootstrapReady,
    availableModels,
    selectedModel,
    setModel,
  ]);

  useEffect(() => {
    return () => {
      abortBackgroundPostProcessing();
      assistantSelectRequestRef.current += 1;
      if (actionErrorTimerRef.current) {
        clearTimeout(actionErrorTimerRef.current);
        actionErrorTimerRef.current = null;
      }
    };
  }, [abortBackgroundPostProcessing]);

  useEffect(
    () => () => abortBackgroundPostProcessing(),
    [abortBackgroundPostProcessing, currentSessionId],
  );

  // Ensure a session exists on mount
  useEffect(() => {
    // Wait for chat store to hydrate before creating/selecting sessions
    if (!chatHasHydrated) return;

    const timer = setTimeout(() => {
      if (sessions.length === 0) {
        createSession();
      } else if (!currentSessionId) {
        selectSession(sessions[0].id);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [
    chatHasHydrated,
    sessions,
    currentSessionId,
    createSession,
    selectSession,
  ]);

  const updateIsNearMessageBottom = useCallback(() => {
    const container = messagesScrollRef.current;
    if (!container) {
      isNearMessageBottomRef.current = true;
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isNearMessageBottomRef.current = distanceFromBottom < 160;
  }, []);

  // Scroll to bottom when the user is already following the live stream.
  useEffect(() => {
    if (
      welcomeState === "hidden" &&
      (isGenerating || messages.length > 0) &&
      isNearMessageBottomRef.current
    ) {
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      messagesEndRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "end",
      });
    }
  }, [messages, isGenerating, welcomeState]);

  // --- Handlers ---

  const showActionError = (message: string) => {
    if (actionErrorTimerRef.current) {
      clearTimeout(actionErrorTimerRef.current);
    }
    setActionError(message);
    actionErrorTimerRef.current = setTimeout(() => {
      actionErrorTimerRef.current = null;
      setActionError(null);
    }, 5000);
  };

  useEffect(() => {
    if (activeSessionLoadError === "session_load_failed") {
      showActionError(t("errLoadChat"));
    }
  }, [activeSessionLoadError, t]);

  const syncActiveSessionWithNotice = async (
    sessionId: string,
    logMessage: string,
  ) => {
    try {
      await syncActiveSession(sessionId);
    } catch (error) {
      logChatAppError(logMessage, error);
      showActionError(t("errSaveChanges"));
    }
  };

  const stopActiveGenerationWithFeedback = async () => {
    abortBackgroundPostProcessing();
    try {
      await stopActiveGeneration();
    } catch (error) {
      logChatAppError("Failed to persist stopped generation", error);
      showActionError(t("errSaveStopped"));
    }
  };

  const handleStopGeneration = () => {
    void stopActiveGenerationWithFeedback();
  };

  const getEffectiveContextForSession = (
    session?: typeof currentSession | null,
  ) => {
    const { providerId } = parseModelString(selectedModel);
    const provider = providerId
      ? providers.find((item) => item.id === providerId)
      : providers.find((item) => item.enabled);
    const workspace = session?.workspaceId
      ? workspaces.find((item) => item.id === session.workspaceId)
      : null;

    return resolveEffectiveChatContext({
      session,
      workspace,
      systemPrompt: system.systemPrompt,
      personality: system.personality,
      enableHtmlVisualPrompt: system.enableHtmlVisualPrompt,
      selectedModel,
      provider,
      modelMetadata,
      customModelMetadata,
      chatConfig,
      search: {
        provider: search.provider,
        configs: search.configs,
      },
      rag,
      installedPlugins,
      installedSkills,
      pluginConfigs,
      activePlugins,
    });
  };

  const processPromptForModel = async (
    session: typeof currentSession | null | undefined,
    text: string,
    attachments: Attachment[],
    signal: AbortSignal,
    existingMemoryContext?: Message["memoryContext"],
  ) => {
    const effectiveContext = getEffectiveContextForSession(session);
    const processedData = await processMessageForSending({
      text,
      attachments,
      selectedModel,
      modelMetadata,
      customModelMetadata,
      ragConfig: rag,
      ragEnabled: chatConfig.useRAG !== false,
      knowledgeCollections,
      workspaceKnowledgeCollectionIds:
        effectiveContext.workspaceKnowledgeCollectionIds,
      signal,
    });

    const memoryState = useMemoryStore.getState();
    const directMemoryContext = existingMemoryContext?.promptContext
      ? {
          text: existingMemoryContext.promptContext,
          injectedMemoryIds: existingMemoryContext.injectedMemoryIds,
        }
      : memoryState._hasHydrated &&
          memoryState.settings.enabled &&
          memoryState.settings.searchEnabled
        ? buildDirectMemoryPromptContext({
            memories: memoryState.memories,
            query: text,
            alreadyInjectedMemoryIds: getSuppressedMemoryIds(
              session,
              useChatStore.getState().activeMessages,
            ),
          })
        : { text: "", injectedMemoryIds: [] };
    const memoryContext =
      directMemoryContext.text &&
      directMemoryContext.injectedMemoryIds.length > 0
        ? {
            injectedMemoryIds: directMemoryContext.injectedMemoryIds,
            promptContext: directMemoryContext.text,
            createdAt: existingMemoryContext?.createdAt || Date.now(),
          }
        : undefined;

    return {
      ...processedData,
      userMessage: memoryContext
        ? { ...processedData.userMessage, memoryContext }
        : processedData.userMessage,
      finalText: directMemoryContext.text
        ? appendContextToChatInput(
            processedData.finalText,
            directMemoryContext.text,
            {
              separator: "\n\n",
            },
          )
        : processedData.finalText,
      effectiveContext,
      injectedMemoryIds: directMemoryContext.injectedMemoryIds,
    };
  };

  const commitInjectedMemoryContext = (
    sessionId: string,
    session: typeof currentSession | null | undefined,
    injectedMemoryIds: string[],
  ) => {
    if (injectedMemoryIds.length === 0) return;
    const merged = Array.from(
      new Set([
        ...(session?.memoryContext?.injectedMemoryIds || []),
        ...injectedMemoryIds,
      ]),
    );
    updateSessionMemoryContext(sessionId, {
      injectedMemoryIds: merged,
      updatedAt: Date.now(),
    });
  };

  const handleSendMessage = async (text: string, attachments: Attachment[]) => {
    const chatState = useChatStore.getState();
    if (
      (!text.trim() && attachments.length === 0) ||
      isGenerating ||
      chatState.isActiveSessionLoading
    ) {
      return;
    }

    let targetSessionId = chatState.currentSessionId;

    if (!targetSessionId) {
      targetSessionId = createSession();
    }

    if (!targetSessionId) return;

    // Auto-rename check
    let shouldAutoRename = false;
    let sessionForCheck = sessions.find((s) => s.id === targetSessionId);

    if (!sessionForCheck) {
      sessionForCheck = useChatStore
        .getState()
        .sessions.find((s) => s.id === targetSessionId);
    }

    if (
      system.enableAutoTitle &&
      sessionForCheck &&
      sessionForCheck.messageCount === 0 &&
      sessionForCheck.title === "New Chat"
    ) {
      shouldAutoRename = true;
    }

    abortBackgroundPostProcessing();
    const generation = beginActiveGeneration();

    const modelDisplayName = getModelDisplayName(
      selectedModel,
      availableModels,
    );

    let botMsgId: string | null = null;
    let userMessageAdded = false;
    let startTime = Date.now();

    try {
      // Process message and attachments
      const sessionForProcessing =
        useChatStore
          .getState()
          .sessions.find((s) => s.id === targetSessionId) || sessionForCheck;
      const processedData = await processPromptForModel(
        sessionForProcessing,
        text,
        attachments,
        generation.controller.signal,
      );

      const {
        finalText,
        finalAttachments,
        ragSources,
        ragError,
        userMessage,
        injectedMemoryIds,
      } = processedData;

      if (!isGenerationRunActive(generation)) return;
      commitInjectedMemoryContext(
        targetSessionId,
        sessionForProcessing,
        injectedMemoryIds,
      );

      // Add User Message
      await addMessage(targetSessionId, userMessage);
      userMessageAdded = true;
      if (!isGenerationRunActive(generation)) return;

      // Add Placeholder Bot Message
      const botMsg = createBotMessagePlaceholder(
        modelDisplayName,
        ragSources,
        ragError,
      );
      const currentBotMsgId = botMsg.id;
      botMsgId = currentBotMsgId;
      startTime = botMsg.timestamp;

      await addMessage(targetSessionId, botMsg);
      if (!isGenerationRunActive(generation)) return;

      // Get fresh session data
      const historyMessages = useChatStore.getState().activeMessages;
      const freshSession = useChatStore
        .getState()
        .sessions.find((s) => s.id === targetSessionId);

      if (!freshSession) throw new Error("Session not found");
      const effectiveContext = processedData.effectiveContext;

      // Prepare History for LLM (excluding the just-added user message)
      // Filter out the user message we just added since it will be sent separately
      const historyWithoutCurrentUser = historyMessages.filter(
        (m) => m.id !== userMessage.id,
      );

      const { prepareHistoryForLLM, streamChatResponse } =
        await loadChatService();
      const historyForLLM = await prepareHistoryForLLM(
        historyWithoutCurrentUser,
        freshSession.compression,
        selectedModel,
      );
      if (!isGenerationRunActive(generation)) return;

      const effectiveConfig = resolveEffectiveChatRequestConfig({
        chatConfig,
        selectedModel,
        modelMetadata,
        customModelMetadata,
        searchCompatibility: effectiveContext.searchCompatibility,
      });
      const skillResolution = await resolveSkillsForMessage({
        message: text,
        selectedModel,
        locale,
        installedSkills,
        activeSkillIds: effectiveContext.activeSkillIds,
        autoSelect: skillAutoSelect,
        signal: generation.controller.signal,
      });
      if (!isGenerationRunActive(generation)) return;

      if (skillResolution.invocations.length > 0) {
        updateMessage(targetSessionId, currentBotMsgId, {
          skillInvocations: skillResolution.invocations,
        });
      }

      let latestStreamText = "";
      let latestStreamReasoning = "";

      await streamChatResponse(
        targetSessionId,
        selectedModel,
        historyForLLM,
        finalText, // Injected context included here
        finalAttachments, // Injected files included here (excluding original KB refs)
        effectiveConfig,
        (streamText, streamReasoning, outputBlocks) => {
          if (!isGenerationRunActive(generation)) return;
          latestStreamText = streamText;
          if (streamReasoning !== undefined) {
            latestStreamReasoning = streamReasoning;
          }
          // Update active state in memory only
          updateMessageContent(
            targetSessionId!,
            currentBotMsgId,
            streamText,
            streamReasoning,
            outputBlocks,
          );
        },
        effectiveContext.systemInstruction,
        (isSearching, results) => {
          if (!isGenerationRunActive(generation)) return;
          const currentMessage = useChatStore
            .getState()
            .activeMessages.find((message) => message.id === currentBotMsgId);
          const updates = buildSearchUpdate(
            currentMessage,
            isSearching,
            results,
          );
          updateMessage(targetSessionId!, currentBotMsgId, updates);
        },
        (toolCalls) => {
          if (!isGenerationRunActive(generation)) return;
          updateMessage(targetSessionId!, currentBotMsgId, { toolCalls });
        },
        (images) => {
          if (!isGenerationRunActive(generation)) return;
          const currentActiveMsgs = useChatStore.getState().activeMessages;
          const msg = currentActiveMsgs.find((m) => m.id === currentBotMsgId);
          const currentAttachments = msg?.attachments || [];

          updateMessage(targetSessionId!, currentBotMsgId, {
            attachments: [...currentAttachments, ...images],
          });
        },
        (usage) => {
          if (!isGenerationRunActive(generation)) return;
          const currentMessages = useChatStore.getState().activeMessages;
          handleTokenUsageUpdate(
            usage,
            currentMessages,
            userMessage.id,
            currentBotMsgId,
            targetSessionId!,
            updateMessage,
          );
        },
        generation.controller.signal,
        effectiveContext.activePluginIds,
        skillResolution.context,
        (outputBlocks) => {
          if (!isGenerationRunActive(generation)) return;
          updateMessageContent(
            targetSessionId!,
            currentBotMsgId,
            latestStreamText,
            latestStreamReasoning || undefined,
            outputBlocks,
          );
        },
      );

      if (!isGenerationRunActive(generation)) return;
      const endTime = Date.now();
      updateMessage(targetSessionId, currentBotMsgId, {
        timing: {
          startTime,
          endTime,
          duration: endTime - startTime,
        },
      });

      // --- Post-Generation ---
      // Force sync active messages to storage at end of generation
      await syncActiveSession(targetSessionId);
      if (!isGenerationRunActive(generation)) return;

      const postGenerationState = useChatStore.getState();
      const postGenerationSession = postGenerationState.sessions.find(
        (session) => session.id === targetSessionId,
      );
      const postGenerationSnapshot = createSessionPostGenerationSnapshot(
        postGenerationSession,
      );
      const isTargetSessionActive =
        postGenerationState.currentSessionId === targetSessionId;
      const updatedHistory = isTargetSessionActive
        ? postGenerationState.activeMessages
        : [];
      const completedBotMessage = isTargetSessionActive
        ? updatedHistory.find((message) => message.id === currentBotMsgId)
        : undefined;
      const suggestedQuestionSnapshot = completedBotMessage
        ? {
            id: completedBotMessage.id,
            content: completedBotMessage.content,
          }
        : null;
      const postProcessSignal = beginBackgroundPostProcessing();

      if (completedBotMessage) {
        queueMemoryExtraction(
          targetSessionId,
          userMessage,
          {
            id: completedBotMessage.id,
            content: completedBotMessage.content,
          },
          postProcessSignal,
        );
      }

      // 1. Follow-up Questions
      if (system.enableRelatedQuestions && updatedHistory.length > 0) {
        loadChatService()
          .then(({ generateRelatedQuestions }) =>
            generateRelatedQuestions(updatedHistory, postProcessSignal),
          )
          .then((questions) => {
            if (postProcessSignal.aborted) return;
            const state = useChatStore.getState();
            const currentMessage =
              state.currentSessionId === targetSessionId
                ? state.activeMessages.find(
                    (message) => message.id === currentBotMsgId,
                  )
                : undefined;
            if (
              questions &&
              questions.length > 0 &&
              shouldApplySuggestedQuestions(
                currentMessage,
                suggestedQuestionSnapshot,
              )
            ) {
              setSuggestedQuestions(
                targetSessionId!,
                currentBotMsgId,
                questions,
              );
            }
          })
          .catch((err) => {
            if (postProcessSignal.aborted) return;
            logChatAppError("Related question generation failed:", err);
          });
      }

      // 2. Auto-Rename
      if (shouldAutoRename && updatedHistory.length > 0) {
        loadChatService()
          .then(({ generateChatTitle }) =>
            generateChatTitle(updatedHistory, postProcessSignal),
          )
          .then((newTitle) => {
            if (postProcessSignal.aborted) return;
            const currentSession = useChatStore
              .getState()
              .sessions.find((session) => session.id === targetSessionId);
            if (
              newTitle &&
              shouldApplyGeneratedTitle(currentSession, postGenerationSnapshot)
            ) {
              updateSessionTitle(targetSessionId!, newTitle);
            }
          })
          .catch((err) => {
            if (postProcessSignal.aborted) return;
            logChatAppError("Chat title generation failed:", err);
          });
      }

      // 3. Auto-Compress
      if (
        system.enableAutoCompression &&
        postGenerationSession &&
        updatedHistory.length > 0
      ) {
        loadChatService()
          .then(({ performBackgroundCompression }) =>
            performBackgroundCompression(
              updatedHistory,
              postGenerationSession.compression,
              selectedModel,
              postProcessSignal,
            ),
          )
          .then((newCompression) => {
            if (postProcessSignal.aborted) return;
            const currentSession = useChatStore
              .getState()
              .sessions.find((session) => session.id === targetSessionId);
            if (
              newCompression &&
              shouldApplyCompressionUpdate(
                currentSession,
                postGenerationSnapshot,
              )
            ) {
              updateSessionCompression(targetSessionId!, newCompression);
            }
          })
          .catch((err) => {
            if (postProcessSignal.aborted) return;
            logChatAppError("Context compression failed:", err);
          });
      }
    } catch (error: any) {
      if (error.name === "AbortError" || generation.controller.signal.aborted) {
        return;
      } else {
        logChatAppError("Generating content failed:", error);
        let errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred.";
        if (typeof error === "object" && error !== null && "message" in error) {
          errorMessage = error.message;
        } else if (typeof error === "string") {
          errorMessage = error;
        }

        if (!userMessageAdded) {
          const fallbackUserMessage: Message = {
            id: uuidv7(),
            role: "user",
            content: text,
            timestamp: Date.now(),
            attachments,
          };
          await addMessage(targetSessionId, fallbackUserMessage);
          userMessageAdded = true;
        }

        if (botMsgId) {
          updateMessage(targetSessionId, botMsgId, {
            generationError: {
              message: errorMessage,
              recoverable: true,
            },
            timing: {
              startTime,
              endTime: Date.now(),
              duration: Date.now() - startTime,
            },
          });
        } else {
          const errorBotMsg = createBotMessagePlaceholder(modelDisplayName, []);
          errorBotMsg.content = "";
          errorBotMsg.generationError = {
            message: errorMessage,
            recoverable: true,
          };
          errorBotMsg.timing = {
            startTime,
            endTime: Date.now(),
            duration: Date.now() - startTime,
          };
          await addMessage(targetSessionId, errorBotMsg);
        }

        await syncActiveSession(targetSessionId); // Sync error message too
      }
    } finally {
      finishActiveGeneration(generation);
    }
  };

  const generateModelResponseBranch = async (
    messageId: string,
    {
      errorMessage,
      logPrefix,
    }: {
      errorMessage: string;
      logPrefix: string;
    },
  ) => {
    if (
      isGenerating ||
      !currentSessionId ||
      useChatStore.getState().isActiveSessionLoading
    ) {
      return;
    }

    const sessionMessages = activeMessages;
    if (!sessionMessages) return;

    const msgIndex = sessionMessages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const historyContext = sessionMessages.slice(0, msgIndex);

    const lastUserMsg = historyContext[historyContext.length - 1];
    if (!lastUserMsg || lastUserMsg.role !== "user") {
      logChatAppError(`${logPrefix}: preceding message is not a user message.`);
      showActionError(errorMessage);
      return;
    }

    const promptText = lastUserMsg.content;
    const promptAttachments = lastUserMsg.attachments || [];

    const currentModelInfo = availableModels.find(
      (m) => m.name === selectedModel,
    );
    const modelDisplayName = currentModelInfo?.displayName || selectedModel;

    const branchMessageId = addMessageVersion(
      currentSessionId,
      messageId,
      modelDisplayName,
    );
    if (!branchMessageId) {
      showActionError(errorMessage);
      return;
    }
    abortBackgroundPostProcessing();
    const generation = beginActiveGeneration();
    const startTime = Date.now();

    try {
      const sessionMeta = getCurrentSession();
      const {
        finalText,
        finalAttachments,
        ragSources,
        ragError,
        effectiveContext,
        injectedMemoryIds,
      } = await processPromptForModel(
        sessionMeta,
        promptText,
        promptAttachments,
        generation.controller.signal,
        lastUserMsg.memoryContext,
      );
      if (!isGenerationRunActive(generation)) return;
      commitInjectedMemoryContext(
        currentSessionId,
        sessionMeta,
        injectedMemoryIds,
      );
      const skillResolution = await resolveSkillsForMessage({
        message: promptText,
        selectedModel,
        locale,
        installedSkills,
        activeSkillIds: effectiveContext.activeSkillIds,
        autoSelect: skillAutoSelect,
        signal: generation.controller.signal,
      });
      if (!isGenerationRunActive(generation)) return;
      if (ragSources.length > 0 || ragError) {
        updateMessage(currentSessionId, branchMessageId, {
          ragSources,
          ragError,
        });
      }
      if (skillResolution.invocations.length > 0) {
        updateMessage(currentSessionId, branchMessageId, {
          skillInvocations: skillResolution.invocations,
        });
      }
      const historyBeforeUser = historyContext.slice(0, -1);
      const { prepareHistoryForLLM, streamChatResponse } =
        await loadChatService();
      const historyForApi = await prepareHistoryForLLM(
        historyBeforeUser,
        sessionMeta?.compression,
        selectedModel,
      );
      if (!isGenerationRunActive(generation)) return;

      let latestStreamText = "";
      let latestStreamReasoning = "";

      await streamChatResponse(
        currentSessionId,
        selectedModel,
        historyForApi, // Don't include lastUserMsg here, it's sent as newMessage
        finalText,
        finalAttachments,
        resolveEffectiveChatRequestConfig({
          chatConfig,
          selectedModel,
          modelMetadata,
          customModelMetadata,
          searchCompatibility: effectiveContext.searchCompatibility,
        }),
        (streamText, streamReasoning, outputBlocks) => {
          if (!isGenerationRunActive(generation)) return;
          latestStreamText = streamText;
          if (streamReasoning !== undefined) {
            latestStreamReasoning = streamReasoning;
          }
          updateMessageContent(
            currentSessionId,
            branchMessageId,
            streamText,
            streamReasoning,
            outputBlocks,
          );
        },
        effectiveContext.systemInstruction,
        (isSearching, results) => {
          if (!isGenerationRunActive(generation)) return;
          const currentMessage = useChatStore
            .getState()
            .activeMessages.find((message) => message.id === branchMessageId);
          const updates = buildSearchUpdate(
            currentMessage,
            isSearching,
            results,
          );
          updateMessage(currentSessionId, branchMessageId, updates);
        },
        (toolCalls) => {
          if (!isGenerationRunActive(generation)) return;
          updateMessage(currentSessionId, branchMessageId, { toolCalls });
        },
        (images) => {
          if (!isGenerationRunActive(generation)) return;
          const currentActiveMsgs = useChatStore.getState().activeMessages;
          const msg = currentActiveMsgs.find((m) => m.id === branchMessageId);
          const currentAttachments = msg?.attachments || [];
          updateMessage(currentSessionId, branchMessageId, {
            attachments: [...currentAttachments, ...images],
          });
        },
        (usage) => {
          if (!isGenerationRunActive(generation)) return;
          const currentMessages = useChatStore.getState().activeMessages;
          handleTokenUsageUpdate(
            usage,
            currentMessages,
            lastUserMsg.id,
            branchMessageId,
            currentSessionId,
            updateMessage,
          );
        },
        generation.controller.signal,
        effectiveContext.activePluginIds,
        skillResolution.context,
        (outputBlocks) => {
          if (!isGenerationRunActive(generation)) return;
          updateMessageContent(
            currentSessionId,
            branchMessageId,
            latestStreamText,
            latestStreamReasoning || undefined,
            outputBlocks,
          );
        },
      );

      if (!isGenerationRunActive(generation)) return;
      const endTime = Date.now();
      updateMessage(currentSessionId, branchMessageId, {
        timing: {
          startTime,
          endTime,
          duration: endTime - startTime,
        },
      });

      await syncActiveSession(currentSessionId);
      if (!isGenerationRunActive(generation)) return;
      const postProcessSignal = beginBackgroundPostProcessing();
      const completedBranchMessage = useChatStore
        .getState()
        .activeMessages.find((message) => message.id === branchMessageId);
      if (completedBranchMessage) {
        queueMemoryExtraction(
          currentSessionId,
          lastUserMsg,
          {
            id: completedBranchMessage.id,
            content: completedBranchMessage.content,
          },
          postProcessSignal,
        );
      }
    } catch (error: any) {
      if (error.name === "AbortError" || generation.controller.signal.aborted) {
        return;
      } else {
        logChatAppError(`${logPrefix} generation failed:`, error);
        const errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred.";
        updateMessage(currentSessionId, branchMessageId, {
          generationError: {
            message: errorMessage,
            recoverable: true,
          },
          timing: {
            startTime,
            endTime: Date.now(),
            duration: Date.now() - startTime,
          },
        });
        await syncActiveSessionWithNotice(
          currentSessionId,
          `Failed to persist ${logPrefix.toLowerCase()} error message`,
        );
      }
    } finally {
      finishActiveGeneration(generation);
    }
  };

  const handleRegenerate = async (messageId: string) => {
    await generateModelResponseBranch(messageId, {
      errorMessage: t("errRegenerate"),
      logPrefix: "Regeneration",
    });
  };

  const handleVersionChange = (msgId: string, direction: "prev" | "next") => {
    if (currentSessionId && !useChatStore.getState().isActiveSessionLoading) {
      switchMessageVersion(currentSessionId, msgId, direction);
    }
  };

  const handleAssistantSelect = async (agent: LobeAgent) => {
    const requestId = assistantSelectRequestRef.current + 1;
    assistantSelectRequestRef.current = requestId;

    if (isGenerating) {
      void stopActiveGenerationWithFeedback();
    }

    if (viewMode === "assistants") {
      navigateToPanel("chat");
    }

    let instruction = agent.meta.systemRole;

    if (!instruction && !agent.isCustom) {
      try {
        const detail = await getAgentDetail(agent.identifier, locale);
        if (requestId !== assistantSelectRequestRef.current) return;
        instruction = detail.config?.systemRole;
      } catch (e) {
        if (requestId !== assistantSelectRequestRef.current) return;
        logChatAppError("Failed to fetch agent details for instruction", e);
      }
    }

    if (requestId !== assistantSelectRequestRef.current) return;

    if (!instruction) {
      instruction = `You are ${agent.meta.title}. ${agent.meta.description}`;
    }

    if (currentSessionId) {
      const session = getCurrentSession();
      if (
        session &&
        session.messageCount === 0 &&
        session.title === "New Chat"
      ) {
        updateSessionInstruction(currentSessionId, instruction);
        updateSessionTitle(currentSessionId, agent.meta.title);
        return;
      }
    }

    abortBackgroundPostProcessing();
    createSession(instruction, agent.meta.title);
  };

  const handleEditMessage = (msgId: string, newContent: string) => {
    if (currentSessionId && !useChatStore.getState().isActiveSessionLoading) {
      updateMessageContent(currentSessionId, msgId, newContent);
      void syncActiveSessionWithNotice(
        currentSessionId,
        "Failed to persist edited message",
      );
    }
  };

  const handleSubmitUserMessageEdit = async (
    msgId: string,
    newContent: string,
  ) => {
    const sessionId = currentSessionId;
    if (
      !sessionId ||
      isGenerating ||
      useChatStore.getState().isActiveSessionLoading ||
      !newContent.trim()
    ) {
      return;
    }

    const sessionMessages = activeMessages;
    const msgIndex = sessionMessages.findIndex(
      (message) => message.id === msgId,
    );
    const sourceMessage = sessionMessages[msgIndex];
    if (!sourceMessage || sourceMessage.role !== "user") {
      showActionError(t("errEditUserMessage"));
      return;
    }
    if (newContent === sourceMessage.content) return;

    abortBackgroundPostProcessing();
    const generation = beginActiveGeneration();
    let modelMessageId: string | null = null;
    let editedUserMessageId: string | null = null;
    let startTime = Date.now();

    try {
      const sessionMeta = getCurrentSession();
      const {
        finalText,
        finalAttachments,
        ragSources,
        ragError,
        userMessage,
        effectiveContext,
        injectedMemoryIds,
      } = await processPromptForModel(
        sessionMeta,
        newContent,
        sourceMessage.attachments || [],
        generation.controller.signal,
      );
      if (!isGenerationRunActive(generation)) return;
      commitInjectedMemoryContext(sessionId, sessionMeta, injectedMemoryIds);

      const skillResolution = await resolveSkillsForMessage({
        message: newContent,
        selectedModel,
        locale,
        installedSkills,
        activeSkillIds: effectiveContext.activeSkillIds,
        autoSelect: skillAutoSelect,
        signal: generation.controller.signal,
      });
      if (!isGenerationRunActive(generation)) return;

      const modelDisplayName = getModelDisplayName(
        selectedModel,
        availableModels,
      );
      const modelPlaceholder = createBotMessagePlaceholder(
        modelDisplayName,
        ragSources,
        ragError,
      );
      startTime = modelPlaceholder.timestamp;

      const branchIds = createEditedUserMessageBranch(
        sessionId,
        msgId,
        userMessage,
        modelPlaceholder,
      );
      if (!branchIds) {
        showActionError(t("errEditUserMessage"));
        return;
      }

      editedUserMessageId = branchIds.userMessageId;
      modelMessageId = branchIds.modelMessageId;
      if (skillResolution.invocations.length > 0) {
        updateMessage(sessionId, modelMessageId, {
          skillInvocations: skillResolution.invocations,
        });
      }

      const historyBeforeUser = sessionMessages.slice(0, msgIndex);
      const { prepareHistoryForLLM, streamChatResponse } =
        await loadChatService();
      const historyForApi = await prepareHistoryForLLM(
        historyBeforeUser,
        sessionMeta?.compression,
        selectedModel,
      );
      if (!isGenerationRunActive(generation)) return;

      let latestStreamText = "";
      let latestStreamReasoning = "";

      await streamChatResponse(
        sessionId,
        selectedModel,
        historyForApi,
        finalText,
        finalAttachments,
        resolveEffectiveChatRequestConfig({
          chatConfig,
          selectedModel,
          modelMetadata,
          customModelMetadata,
          searchCompatibility: effectiveContext.searchCompatibility,
        }),
        (streamText, streamReasoning, outputBlocks) => {
          if (!isGenerationRunActive(generation) || !modelMessageId) return;
          latestStreamText = streamText;
          if (streamReasoning !== undefined) {
            latestStreamReasoning = streamReasoning;
          }
          updateMessageContent(
            sessionId,
            modelMessageId,
            streamText,
            streamReasoning,
            outputBlocks,
          );
        },
        effectiveContext.systemInstruction,
        (isSearching, results) => {
          if (!isGenerationRunActive(generation) || !modelMessageId) return;
          const currentMessage = useChatStore
            .getState()
            .activeMessages.find((message) => message.id === modelMessageId);
          const updates = buildSearchUpdate(
            currentMessage,
            isSearching,
            results,
          );
          updateMessage(sessionId, modelMessageId, updates);
        },
        (toolCalls) => {
          if (!isGenerationRunActive(generation) || !modelMessageId) return;
          updateMessage(sessionId, modelMessageId, { toolCalls });
        },
        (images) => {
          if (!isGenerationRunActive(generation) || !modelMessageId) return;
          const currentActiveMsgs = useChatStore.getState().activeMessages;
          const msg = currentActiveMsgs.find(
            (message) => message.id === modelMessageId,
          );
          const currentAttachments = msg?.attachments || [];

          updateMessage(sessionId, modelMessageId, {
            attachments: [...currentAttachments, ...images],
          });
        },
        (usage) => {
          if (
            !isGenerationRunActive(generation) ||
            !modelMessageId ||
            !editedUserMessageId
          ) {
            return;
          }
          const currentMessages = useChatStore.getState().activeMessages;
          handleTokenUsageUpdate(
            usage,
            currentMessages,
            editedUserMessageId,
            modelMessageId,
            sessionId,
            updateMessage,
          );
        },
        generation.controller.signal,
        effectiveContext.activePluginIds,
        skillResolution.context,
        (outputBlocks) => {
          if (!isGenerationRunActive(generation) || !modelMessageId) return;
          updateMessageContent(
            sessionId,
            modelMessageId,
            latestStreamText,
            latestStreamReasoning || undefined,
            outputBlocks,
          );
        },
      );

      if (!isGenerationRunActive(generation) || !modelMessageId) return;
      const endTime = Date.now();
      updateMessage(sessionId, modelMessageId, {
        timing: {
          startTime,
          endTime,
          duration: endTime - startTime,
        },
      });

      await syncActiveSession(sessionId);
      if (!isGenerationRunActive(generation)) return;
      const postProcessSignal = beginBackgroundPostProcessing();
      const completedModelMessage = useChatStore
        .getState()
        .activeMessages.find((message) => message.id === modelMessageId);
      if (completedModelMessage && editedUserMessageId) {
        queueMemoryExtraction(
          sessionId,
          { id: editedUserMessageId, content: newContent },
          {
            id: completedModelMessage.id,
            content: completedModelMessage.content,
          },
          postProcessSignal,
        );
      }
    } catch (error: any) {
      if (error.name === "AbortError" || generation.controller.signal.aborted) {
        return;
      }

      logChatAppError("User message edit branch generation failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred.";
      if (modelMessageId) {
        updateMessage(sessionId, modelMessageId, {
          generationError: {
            message: errorMessage,
            recoverable: true,
          },
          timing: {
            startTime,
            endTime: Date.now(),
            duration: Date.now() - startTime,
          },
        });
        await syncActiveSessionWithNotice(
          sessionId,
          "Failed to persist edited user message branch error",
        );
      } else {
        showActionError(t("errEditUserMessage"));
      }
    } finally {
      finishActiveGeneration(generation);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    const sessionId = currentSessionId;
    if (!sessionId || useChatStore.getState().isActiveSessionLoading) return;

    try {
      await deleteMessage(sessionId, msgId);
    } catch (error) {
      logChatAppError("Failed to delete message", error);
      showActionError(t("errDeleteMessage"));
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      if (sessionId === currentSessionId) {
        abortBackgroundPostProcessing();
      }
      if (
        shouldAbortActiveGenerationForSessionDelete({
          currentSessionId,
          deletingSessionId: sessionId,
          isGenerating,
        })
      ) {
        await stopActiveGeneration();
      }

      await deleteSession(sessionId);
    } catch (error) {
      logChatAppError("Failed to delete session", error);
      showActionError(t("errDeleteChat"));
    }
  };

  const handleDuplicateSession = async (sessionId: string) => {
    if (isGenerating || useChatStore.getState().isActiveSessionLoading) return;

    try {
      abortBackgroundPostProcessing();
      await duplicateSession(sessionId);
    } catch (error) {
      logChatAppError("Failed to duplicate session", error);
      showActionError(t("errDuplicateChat"));
    }
  };

  const handleRetractMessage = async (msg: Message) => {
    const sessionId = currentSessionId;
    if (!sessionId || useChatStore.getState().isActiveSessionLoading) return;

    try {
      await deleteMessageAndSubsequent(sessionId, msg.id);

      if (messageInputRef.current) {
        messageInputRef.current.setValue(msg.content);
        messageInputRef.current.focus();
      }
    } catch (error) {
      logChatAppError("Failed to retract message", error);
      showActionError(t("errRetractMessage"));
    }
  };

  const handleSmartRename = async (sessionId: string) => {
    const snapshot = createSessionPostGenerationSnapshot(
      useChatStore
        .getState()
        .sessions.find((session) => session.id === sessionId),
    );
    if (!snapshot) return;

    // Need messages for rename, if active session, use state, else load
    let msgs: Message[];
    try {
      const state = useChatStore.getState();
      if (state.currentSessionId === sessionId) {
        msgs = state.activeMessages;
      } else {
        const storedMessages = await appDb.getItem<
          Message[] | SessionMessageTree
        >(`session_messages_${sessionId}`);
        msgs = getActiveMessagePath(
          normalizeSessionMessageTree(storedMessages),
        );
      }
    } catch (error) {
      logChatAppError("Failed to load messages for smart rename", error);
      showActionError(t("errRenameChat"));
      return;
    }

    if (msgs.length === 0) return;

    const { generateChatTitle } = await loadChatService();
    const newTitle = await generateChatTitle(msgs);
    const currentSession = useChatStore
      .getState()
      .sessions.find((session) => session.id === sessionId);
    if (shouldApplyRequestedTitle(currentSession, snapshot)) {
      updateSessionTitle(sessionId, newTitle);
    }
  };

  const handleNewChat = () => {
    abortBackgroundPostProcessing();
    if (isGenerating) {
      void stopActiveGenerationWithFeedback();
    }

    createSession();
    navigateToPanel("chat");
  };

  const handleSelectSession = async (sessionId: string) => {
    abortBackgroundPostProcessing();
    await selectSession(sessionId);
  };

  const handleSuggestionClick = (question: string) => {
    handleSendMessage(question, []);
  };

  // --- Render ---

  return (
    <ChatAppShell
      actionError={actionError}
      sessions={sessions}
      currentSessionId={currentSessionId}
      currentSession={currentSession}
      messages={messages}
      activeMessageTree={activeMessageTree}
      isGenerating={isGenerating}
      isActiveSessionLoading={isActiveSessionLoading}
      availableModels={availableModels}
      selectedModel={selectedModel}
      isSearchEnabled={chatConfig.useSearch}
      viewMode={viewMode}
      settingsTab={settingsTab}
      isSidebarOpen={isSidebarOpen}
      isNonDesktopViewport={isNonDesktopViewport}
      isSidebarDrawerOpen={isSidebarDrawerOpen}
      mainInertProps={mainInertProps}
      shouldShowChatTitleBar={shouldShowChatTitleBar}
      welcomeState={welcomeState}
      messageInputVariant={messageInputVariant}
      messagesScrollRef={messagesScrollRef}
      messagesEndRef={messagesEndRef}
      messageInputRef={messageInputRef}
      setIsSidebarOpen={setIsSidebarOpen}
      navigateToPanel={navigateToPanel}
      handleSettingsTabChange={handleSettingsTabChange}
      updateIsNearMessageBottom={updateIsNearMessageBottom}
      stopActiveGenerationWithFeedback={stopActiveGenerationWithFeedback}
      selectSession={handleSelectSession}
      handleNewChat={handleNewChat}
      handleDeleteSession={handleDeleteSession}
      updateSessionTitle={updateSessionTitle}
      toggleSessionPin={toggleSessionPin}
      handleDuplicateSession={handleDuplicateSession}
      handleSmartRename={handleSmartRename}
      handleAssistantSelect={handleAssistantSelect}
      updateSessionInstruction={updateSessionInstruction}
      handleEditMessage={handleEditMessage}
      handleDeleteMessage={handleDeleteMessage}
      handleSubmitUserMessageEdit={handleSubmitUserMessageEdit}
      handleRetractMessage={handleRetractMessage}
      handleRegenerate={handleRegenerate}
      handleVersionChange={handleVersionChange}
      handleSendMessage={handleSendMessage}
      handleSuggestionClick={handleSuggestionClick}
      handleStopGeneration={handleStopGeneration}
      setModel={setModel}
      onToggleSearch={() => setChatConfig({ useSearch: !chatConfig.useSearch })}
    />
  );
};

export default ChatApp;
