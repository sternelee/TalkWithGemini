import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "../core/chatStore";
import { useSettingsStore } from "../core/settingsStore";
import { useCoreSettingsStore } from "../core/coreSettingsStore";
import { useKnowledgeStore } from "../core/knowledgeStore";
import { useUIStore } from "../core/uiStore";

/**
 * Optimized hooks using useShallow to prevent unnecessary re-renders
 *
 * useShallow performs shallow comparison of selected state,
 * preventing re-renders when object references change but values remain the same
 */

// Chat Store Hooks
export const useChatSession = () => {
  return useChatStore(
    useShallow((state) => ({
      sessions: state.sessions,
      currentSessionId: state.currentSessionId,
      activeMessages: state.activeMessages,
      isActiveSessionLoading: state.isActiveSessionLoading,
      getCurrentSession: state.getCurrentSession,
    })),
  );
};

export const useChatActions = () => {
  return useChatStore(
    useShallow((state) => ({
      createSession: state.createSession,
      selectSession: state.selectSession,
      deleteSession: state.deleteSession,
      updateSessionTitle: state.updateSessionTitle,
      updateSessionInstruction: state.updateSessionInstruction,
      toggleSessionPin: state.toggleSessionPin,
      duplicateSession: state.duplicateSession,
    })),
  );
};

export const useChatMessages = () => {
  return useChatStore(
    useShallow((state) => ({
      activeMessages: state.activeMessages,
      addMessage: state.addMessage,
      updateMessageContent: state.updateMessageContent,
      updateMessage: state.updateMessage,
      deleteMessage: state.deleteMessage,
      deleteMessageAndSubsequent: state.deleteMessageAndSubsequent,
      setSuggestedQuestions: state.setSuggestedQuestions,
    })),
  );
};

export const useChatConfig = () => {
  return useChatStore(
    useShallow((state) => ({
      selectedModel: state.selectedModel,
      chatConfig: state.chatConfig,
      setModel: state.setModel,
      setChatConfig: state.setChatConfig,
    })),
  );
};

export const useChatWorkspaces = () => {
  return useChatStore(
    useShallow((state) => ({
      workspaces: state.workspaces,
      createWorkspace: state.createWorkspace,
      updateWorkspace: state.updateWorkspace,
      deleteWorkspace: state.deleteWorkspace,
      moveSessionToWorkspace: state.moveSessionToWorkspace,
    })),
  );
};

// Settings Store Hooks
export const useThemeSettings = () => {
  return useCoreSettingsStore(
    useShallow((state) => ({
      theme: state.theme,
      language: state.language,
      setTheme: state.setTheme,
      setLanguage: state.setLanguage,
    })),
  );
};

export const useProviderSettings = () => {
  return useCoreSettingsStore(
    useShallow((state) => ({
      providers: state.providers,
      addProvider: state.addProvider,
      updateProvider: state.updateProvider,
      deleteProvider: state.deleteProvider,
      toggleProviderEnabled: state.toggleProviderEnabled,
    })),
  );
};

export const useDefaultModels = () => {
  return useCoreSettingsStore(
    useShallow((state) => ({
      defaultModels: state.defaultModels,
      updateDefaultModels: state.updateDefaultModels,
    })),
  );
};

export const useModelMetadata = () => {
  return useSettingsStore(
    useShallow((state) => ({
      modelMetadata: state.modelMetadata,
      customModelMetadata: state.customModelMetadata,
      setCustomModelMetadata: state.setCustomModelMetadata,
      fetchModelMetadata: state.fetchModelMetadata,
    })),
  );
};

export const usePluginSettings = () => {
  return useSettingsStore(
    useShallow((state) => ({
      activePlugins: state.activePlugins,
      installedPlugins: state.installedPlugins,
      pluginConfigs: state.pluginConfigs,
      addInstalledPlugin: state.addInstalledPlugin,
      removeInstalledPlugin: state.removeInstalledPlugin,
      togglePluginActive: state.togglePluginActive,
      updatePluginConfig: state.updatePluginConfig,
      togglePluginFunction: state.togglePluginFunction,
    })),
  );
};

export const useAgentSettings = () => {
  return useSettingsStore(
    useShallow((state) => ({
      customAgents: state.customAgents,
      usedAgents: state.usedAgents,
      agentOverrides: state.agentOverrides,
      addCustomAgent: state.addCustomAgent,
      updateAgent: state.updateAgent,
      removeLocalAgent: state.removeLocalAgent,
      recordUsedAgent: state.recordUsedAgent,
      resetAgent: state.resetAgent,
    })),
  );
};

export const useSystemSettings = () => {
  return useSettingsStore(
    useShallow((state) => ({
      system: state.system,
      updateSystemSettings: state.updateSystemSettings,
    })),
  );
};

export const useSearchSettings = () => {
  return useSettingsStore(
    useShallow((state) => ({
      search: state.search,
      setSearchProvider: state.setSearchProvider,
      updateSearchConfig: state.updateSearchConfig,
      setSearchResultsLimit: state.setSearchResultsLimit,
    })),
  );
};

export const useRAGSettings = () => {
  return useSettingsStore(
    useShallow((state) => ({
      rag: state.rag,
      updateRAGConfig: state.updateRAGConfig,
    })),
  );
};

export const useVoiceSettings = () => {
  return useSettingsStore(
    useShallow((state) => ({
      voice: state.voice,
      updateVoiceSettings: state.updateVoiceSettings,
    })),
  );
};

// Knowledge Store Hooks
export const useKnowledgeCollections = () => {
  return useKnowledgeStore(
    useShallow((state) => ({
      collections: state.collections,
      createCollection: state.createCollection,
      updateCollection: state.updateCollection,
      deleteCollection: state.deleteCollection,
    })),
  );
};

export const useKnowledgeFiles = () => {
  return useKnowledgeStore(
    useShallow((state) => ({
      uploadFiles: state.uploadFiles,
      updateFileContent: state.updateFileContent,
      deleteFile: state.deleteFile,
    })),
  );
};

// UI Store Hooks
export const useImagePreview = () => {
  return useUIStore(
    useShallow((state) => ({
      imagePreview: state.imagePreview,
      openImagePreview: state.openImagePreview,
      closeImagePreview: state.closeImagePreview,
      setImagePreviewIndex: state.setImagePreviewIndex,
    })),
  );
};
