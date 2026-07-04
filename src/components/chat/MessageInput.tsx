"use client";
import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useId,
} from "react";
import { v7 as uuidv7 } from "uuid";
import {
  SendHorizontal,
  Paperclip,
  Mic,
  X,
  StopCircle,
  Loader2,
  Cpu,
  Globe,
  Lightbulb,
  Blocks,
  LayoutDashboard,
  Link,
  ChevronDown,
  FileUp,
  ImageUp,
  Square,
  Library,
  PencilSparkles,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Attachment } from "@/types";
import { localizePluginMeta } from "@/lib/plugin/localizedMeta";
import { ModelInfo, streamGenerateContent } from "@/services/api/chatService";
import Tooltip from "../ui/Tooltip";
import RemoteFileModal from "../modals/RemoteFileModal";
import KnowledgeSelectionModal from "../knowledge/KnowledgeSelectionModal";
import SafeImage from "../ui/SafeImage";
import MessageInputAttachmentTray from "./MessageInputAttachmentTray";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/store/core/chatStore";
import { getTaskModel, useSettingsStore } from "@/store/core/settingsStore";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import {
  transcribeAudio,
  startBrowserSpeechRecognition,
} from "@/services/api/voiceService";
import {
  ATTACHMENT_LIMITS,
  formatBytes,
  getAttachmentPayloadChars,
  getAttachmentsPayloadChars,
} from "@/config/limits";
import { parseModelString } from "@/lib/utils/model";
import { stopMediaStreamTracks } from "@/lib/utils/mediaRecording";
import { logDevError } from "@/lib/utils/devLogger";
import {
  getChatAttachmentFileSelectionMessage,
  selectChatAttachmentFiles,
} from "@/lib/utils/chatAttachmentFiles";
import {
  getSearchCompatibility,
  getSearchProviderLabel,
  type SearchCompatibilityReason,
} from "@/lib/settings/searchRag";
import { hasPluginAuthValue } from "@/lib/security/localSecretResolvers";
import { isPluginAuthRequired } from "@/lib/plugin/config";
import { isKnowledgeAttachment } from "@/lib/utils/knowledgeAttachments";
import { createChatDocumentAttachment } from "@/lib/utils/documentAttachments";
import { polishTextContent } from "@/services/artifactService";
import { normalizeSkillIdRefs } from "@/lib/skills";

interface MessageInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop?: () => void;
  disabled: boolean;
  availableModels?: ModelInfo[];
  selectedModel?: string;
  onSelectModel?: (model: string) => void;
  isSearchEnabled?: boolean;
  onToggleSearch?: () => void;
}

export interface MessageInputRef {
  setValue: (value: string) => void;
  focus: () => void;
  setAttachments: (attachments: Attachment[]) => void;
}

const truncateMiddle = (text: string, maxLength: number) => {
  if (!text || text.length <= maxLength) return text;
  const separator = "…";
  const charsToShow = maxLength - separator.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return (
    text.substring(0, frontChars) +
    separator +
    text.substring(text.length - backChars)
  );
};

const logInputError = logDevError;

const iconButtonFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background";

const iconButtonBaseClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg";

const isNativeMediaFile = (file: File) =>
  file.type.startsWith("image/") || file.type.startsWith("audio/");

const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(
  (
    {
      onSend,
      onStop,
      disabled,
      availableModels = [],
      selectedModel = "",
      onSelectModel,
      isSearchEnabled = false,
      onToggleSearch,
    },
    ref,
  ) => {
    const [input, setInput] = useState("");
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [showModelSelect, setShowModelSelect] = useState(false);
    const [showSkillSelect, setShowSkillSelect] = useState(false);
    const [showPluginSelect, setShowPluginSelect] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showRemoteModal, setShowRemoteModal] = useState(false);
    const [showKBModal, setShowKBModal] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isPolishingInput, setIsPolishingInput] = useState(false);
    const [isParsingAttachments, setIsParsingAttachments] = useState(false);

    const t = useTranslations("MessageInput");
    const tConfig = useTranslations("Config");
    const {
      chatConfig,
      setChatConfig,
      currentSessionId,
      sessions,
      updateSessionConfig,
    } = useChatStore();
    const {
      modelMetadata,
      customModelMetadata,
      installedPlugins,
      activePlugins,
      togglePluginActive,
      installedSkills,
      pluginConfigs,
      voice,
      updateVoiceSettings,
      search,
      rag,
      system,
      updateSystemSettings,
    } = useSettingsStore();

    const { providers } = useCoreSettingsStore();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const textFallbackInputRef = useRef<HTMLInputElement>(null);
    const knowledgeButtonRef = useRef<HTMLDivElement>(null);
    const messageInputId = useId();
    const errorMessageId = useId();
    const attachFileInputId = useId();
    const attachImageInputId = useId();
    const attachTextFallbackInputId = useId();
    const knowledgeButtonId = useId();

    // Browser Speech Rec
    const recognitionRef = useRef<any>(null);
    // MediaRecorder Audio Capture
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingKindRef = useRef<"browser" | "media" | null>(null);

    const timerRef = useRef<any>(null);
    const isMountedRef = useRef(true);
    const recordingSessionRef = useRef(0);
    const fileSelectionRunRef = useRef(0);
    const polishRunRef = useRef(0);

    const clearRecordingTimer = useCallback(() => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, []);

    const releaseMediaStream = useCallback(
      (stream = mediaStreamRef.current) => {
        stopMediaStreamTracks(stream);
        if (!stream || mediaStreamRef.current === stream) {
          mediaStreamRef.current = null;
        }
      },
      [],
    );

    useEffect(() => {
      isMountedRef.current = true;

      return () => {
        isMountedRef.current = false;
        recordingSessionRef.current += 1;
        fileSelectionRunRef.current += 1;
        polishRunRef.current += 1;
        clearRecordingTimer();

        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {
            // The browser may throw if recognition has already ended.
          }
          recognitionRef.current = null;
        }

        const recorder = mediaRecorderRef.current;
        if (recorder) {
          recorder.ondataavailable = null;
          recorder.onstop = null;
          if (recorder.state !== "inactive") {
            try {
              recorder.stop();
            } catch {
              // Ignore stale recorder state during component teardown.
            }
          }
          mediaRecorderRef.current = null;
        }

        audioChunksRef.current = [];
        recordingKindRef.current = null;
        releaseMediaStream();
      };
    }, [clearRecordingTimer, releaseMediaStream]);

    const appendAttachments = (incoming: Attachment[]) => {
      if (incoming.length === 0) return;

      const accepted: Attachment[] = [];
      let totalPayloadChars = getAttachmentsPayloadChars(attachments);
      let rejectedByCount = 0;
      let rejectedBySize = 0;

      for (const attachment of incoming) {
        if (
          attachments.length + accepted.length >=
          ATTACHMENT_LIMITS.maxCount
        ) {
          rejectedByCount += 1;
          continue;
        }

        const payloadChars = getAttachmentPayloadChars(attachment);
        if (
          totalPayloadChars + payloadChars >
          ATTACHMENT_LIMITS.maxTotalBase64Chars
        ) {
          rejectedBySize += 1;
          continue;
        }

        totalPayloadChars += payloadChars;
        accepted.push(attachment);
      }

      if (rejectedByCount > 0) {
        setErrorMsg(
          t("attachmentLimitReached", { max: ATTACHMENT_LIMITS.maxCount }),
        );
      } else if (rejectedBySize > 0) {
        setErrorMsg(
          t("attachmentsExceedSize", {
            size: formatBytes(ATTACHMENT_LIMITS.maxTotalBase64Chars),
          }),
        );
      }

      if (accepted.length > 0) {
        setAttachments((prev) => [...prev, ...accepted]);
      }
    };

    useImperativeHandle(ref, () => ({
      setValue: (value: string) => {
        setInput(value);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height =
              textareaRef.current.scrollHeight + "px";
          }
        });
      },
      focus: () => {
        textareaRef.current?.focus();
      },
      setAttachments: (atts: Attachment[]) => {
        setAttachments(atts);
      },
    }));

    // Clear error after 3 seconds
    useEffect(() => {
      if (errorMsg) {
        const timer = setTimeout(() => setErrorMsg(null), 3000);
        return () => clearTimeout(timer);
      }
    }, [errorMsg]);

    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        setShowAttachMenu(false);
        setShowSkillSelect(false);
        setShowPluginSelect(false);
        setShowModelSelect(false);
      };

      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }, []);

    const selectedModelProvider = useMemo(() => {
      if (!selectedModel) return providers.find((provider) => provider.enabled);
      const { providerId } = parseModelString(selectedModel);
      return providerId
        ? providers.find((provider) => provider.id === providerId)
        : providers.find((provider) => provider.enabled);
    }, [selectedModel, providers]);

    const searchCompatibility = useMemo(() => {
      const searchConfig =
        search.provider === "google"
          ? undefined
          : search.configs[search.provider];

      return getSearchCompatibility({
        searchProvider: search.provider,
        searchConfig,
        modelProviderType: selectedModelProvider?.type,
      });
    }, [search, selectedModelProvider?.type]);

    const getSearchUnavailableMessage = (
      reason: SearchCompatibilityReason | undefined,
    ) => {
      switch (reason) {
        case "missing_model_provider":
          return t("searchUnavailableNoProvider");
        case "google_requires_gemini":
          return t("searchUnavailableGoogleGemini");
        case "model_builtin_search_unsupported":
          return t("searchUnavailableModelBuiltIn");
        case "missing_search_api_key":
          return t("searchUnavailableApiKey", {
            provider: getSearchProviderLabel(searchCompatibility.provider),
          });
        case "missing_search_base_url":
          return t("searchUnavailableBaseUrl", {
            provider: getSearchProviderLabel(searchCompatibility.provider),
          });
        default:
          return t("searchUnavailableGeneric");
      }
    };

    const searchModeLabel =
      searchCompatibility.mode === "gemini-google"
        ? t("searchModeGeminiGoogle")
        : searchCompatibility.mode === "openai-web"
          ? t("searchModeOpenAIWeb")
        : t("searchModeExternal", {
            provider: getSearchProviderLabel(searchCompatibility.provider),
          });

    const searchTooltip = !searchCompatibility.enabled
      ? getSearchUnavailableMessage(searchCompatibility.reason)
      : isSearchEnabled
        ? t("disableSearchWithMode", { mode: searchModeLabel })
        : t("enableSearchWithMode", { mode: searchModeLabel });

    const handleSearchToggle = () => {
      if (!searchCompatibility.enabled) {
        setErrorMsg(getSearchUnavailableMessage(searchCompatibility.reason));
        return;
      }
      onToggleSearch?.();
    };

    const currentSession = useMemo(
      () => sessions.find((session) => session.id === currentSessionId),
      [currentSessionId, sessions],
    );
    const activeSkillIds = useMemo(
      () =>
        normalizeSkillIdRefs(
          currentSession?.config?.activeSkills,
          installedSkills,
        ),
      [currentSession?.config?.activeSkills, installedSkills],
    );
    const activeSkillSet = useMemo(
      () => new Set(activeSkillIds),
      [activeSkillIds],
    );
    const skillsForMenu = useMemo(
      () =>
        [...installedSkills].sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
        ),
      [installedSkills],
    );
    const setSessionActiveSkillIds = useCallback(
      (skillIds: string[]) => {
        if (!currentSessionId) return;
        updateSessionConfig(currentSessionId, {
          activeSkills: normalizeSkillIdRefs(skillIds, installedSkills),
        });
      },
      [currentSessionId, installedSkills, updateSessionConfig],
    );
    const toggleSessionSkill = useCallback(
      (skillId: string) => {
        setSessionActiveSkillIds(
          activeSkillSet.has(skillId)
            ? activeSkillIds.filter((id) => id !== skillId)
            : [...activeSkillIds, skillId],
        );
      },
      [activeSkillIds, activeSkillSet, setSessionActiveSkillIds],
    );
    // Group models by provider name
    const groupedModels = useMemo(() => {
      const groups: Record<string, ModelInfo[]> = {};
      availableModels.forEach((model) => {
        const pName = model.providerName || "System";
        if (!groups[pName]) groups[pName] = [];
        groups[pName].push(model);
      });
      return groups;
    }, [availableModels]);

    // --- Capabilities Resolution ---
    const modelCapabilities = useMemo(() => {
      if (!selectedModel)
        return {
          vision: false,
          attachment: false,
          audio: false,
          reasoning: false,
        };

      const { modelName: modelId } = parseModelString(selectedModel);
      // Prioritize custom metadata overrides
      const meta = customModelMetadata[modelId] || modelMetadata[modelId];

      return {
        vision: meta?.modalities?.input?.includes("image") ?? false,
        attachment: meta?.attachment ?? false,
        audio: meta?.modalities?.input?.includes("audio") ?? false,
        reasoning: meta?.reasoning ?? false,
      };
    }, [selectedModel, modelMetadata, customModelMetadata]);

    const isReasoningSupported = useMemo(() => {
      if (!selectedModel) return false;
      const { modelName: modelId } = parseModelString(selectedModel);

      // Check custom metadata first, then global metadata
      const meta = customModelMetadata[modelId] || modelMetadata[modelId];

      if (meta && meta.reasoning !== undefined) return meta.reasoning;

      // Fallback to name heuristic
      const lower = modelId.toLowerCase();
      return (
        lower.includes("thinking") ||
        lower.includes("reasoner") ||
        lower.includes("o1") ||
        lower.includes("r1")
      );
    }, [selectedModel, modelMetadata, customModelMetadata]);

    // Filter plugins to show only those ready for use
    const validPlugins = useMemo(() => {
      return installedPlugins
        .filter((p) => {
          // If auth is required, check if we have a config value
          if (isPluginAuthRequired(p)) {
            const hasConfig = hasPluginAuthValue(pluginConfigs[p.id]?.auth);
            return !!hasConfig;
          }
          return true;
        })
        .map((p) => localizePluginMeta(p, tConfig));
    }, [installedPlugins, pluginConfigs, tConfig]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    };

    const handleSend = () => {
      if (
        (!input.trim() && attachments.length === 0) ||
        disabled ||
        isParsingAttachments ||
        !selectedModel
      ) {
        return;
      }

      onSend(input, attachments);
      setInput("");
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    };

    const handlePolishInput = async () => {
      const originalText = input;
      if (
        !originalText.trim() ||
        disabled ||
        isTranscribing ||
        isParsingAttachments ||
        isPolishingInput
      ) {
        return;
      }

      const runId = polishRunRef.current + 1;
      polishRunRef.current = runId;
      setIsPolishingInput(true);
      setErrorMsg(null);

      try {
        let replacement = "";
        await streamGenerateContent(
          getTaskModel("promptOptimization"),
          polishTextContent(originalText),
          (text) => {
            if (!isMountedRef.current || polishRunRef.current !== runId) return;
            replacement = text;
            setInput(text);
          },
        );

        if (!isMountedRef.current || polishRunRef.current !== runId) return;
        if (!replacement.trim()) {
          setInput(originalText);
          setErrorMsg(t("polishFailed"));
        }
      } catch (error) {
        logInputError("Failed to polish input text", error);
        if (isMountedRef.current && polishRunRef.current === runId) {
          setInput(originalText);
          setErrorMsg(t("polishFailed"));
        }
      } finally {
        if (isMountedRef.current && polishRunRef.current === runId) {
          setIsPolishingInput(false);
        }
      }
    };

    // Convert Blob to Base64 String (helper)
    const blobToBase64 = (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result.split(",")[1]); // remove data:audio/webm;base64, prefix
          } else {
            reject(new Error("Failed to convert blob"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    const startRecording = async () => {
      setErrorMsg(null);
      if (voice.autoTranscribe && voice.sttProvider === "browser") {
        const sessionId = recordingSessionRef.current + 1;
        recordingSessionRef.current = sessionId;
        try {
          recognitionRef.current = startBrowserSpeechRecognition(
            voice.sttLanguage,
            {
              onTranscript: (text) => {
                if (
                  !isMountedRef.current ||
                  recordingSessionRef.current !== sessionId
                ) {
                  return;
                }
                setInput((prev) => prev + (prev ? " " : "") + text);
              },
              onError: (err) => {
                if (
                  !isMountedRef.current ||
                  recordingSessionRef.current !== sessionId
                ) {
                  return;
                }
                logInputError("Speech recognition error", err);
                stopRecording();
              },
              onEnd: () => {
                if (
                  !isMountedRef.current ||
                  recordingSessionRef.current !== sessionId
                ) {
                  return;
                }
                recordingSessionRef.current += 1;
                recognitionRef.current = null;
                recordingKindRef.current = null;
                clearRecordingTimer();
                setIsRecording(false);
              },
            },
          );

          recordingKindRef.current = "browser";
          setIsRecording(true);
          setRecordingSeconds(0);
          clearRecordingTimer();
          timerRef.current = setInterval(() => {
            setRecordingSeconds((prev) => prev + 1);
          }, 1000);
        } catch (e) {
          logInputError("Failed to start browser recording", e);
          recognitionRef.current = null;
          recordingKindRef.current = null;
          if (
            isMountedRef.current &&
            recordingSessionRef.current === sessionId
          ) {
            setErrorMsg(
              e instanceof Error ? e.message : t("failedToStartRecognition"),
            );
          }
        }
      } else {
        const sessionId = recordingSessionRef.current + 1;
        recordingSessionRef.current = sessionId;
        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          if (
            !isMountedRef.current ||
            recordingSessionRef.current !== sessionId
          ) {
            releaseMediaStream(stream);
            return;
          }
          mediaStreamRef.current = stream;

          let mimeType = "audio/webm";
          if (!MediaRecorder.isTypeSupported("audio/webm")) {
            if (MediaRecorder.isTypeSupported("audio/mp4")) {
              mimeType = "audio/mp4";
            } else {
              mimeType = ""; // Let browser decide default
            }
          }

          const mediaRecorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (event) => {
            if (recordingSessionRef.current !== sessionId) return;
            if (event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };

          mediaRecorder.onstop = async () => {
            const recordedType = mediaRecorder.mimeType || "audio/webm";
            const audioChunks = audioChunksRef.current;
            audioChunksRef.current = [];
            releaseMediaStream(stream);
            if (mediaRecorderRef.current === mediaRecorder) {
              mediaRecorderRef.current = null;
            }
            if (recordingKindRef.current === "media") {
              recordingKindRef.current = null;
            }
            clearRecordingTimer();

            if (
              !isMountedRef.current ||
              recordingSessionRef.current !== sessionId
            ) {
              return;
            }
            setIsRecording(false);

            const audioBlob = new Blob(audioChunks, {
              type: recordedType,
            });

            if (voice.autoTranscribe) {
              setIsTranscribing(true);
              try {
                const text = await transcribeAudio(audioBlob, voice);
                if (
                  text &&
                  isMountedRef.current &&
                  recordingSessionRef.current === sessionId
                ) {
                  setInput((prev) => prev + (prev ? " " : "") + text);
                }
              } catch (e) {
                logInputError("Transcription failed", e);
                if (
                  isMountedRef.current &&
                  recordingSessionRef.current === sessionId
                ) {
                  setErrorMsg(
                    e instanceof Error ? e.message : t("transcriptionFailed"),
                  );
                }
              } finally {
                if (
                  isMountedRef.current &&
                  recordingSessionRef.current === sessionId
                ) {
                  setIsTranscribing(false);
                }
              }
            } else {
              try {
                const base64Data = await blobToBase64(audioBlob);
                if (
                  !isMountedRef.current ||
                  recordingSessionRef.current !== sessionId
                ) {
                  return;
                }
                let extension = "webm";
                if (recordedType.includes("mp4")) extension = "mp4";
                else if (recordedType.includes("aac")) extension = "aac";
                else if (recordedType.includes("ogg")) extension = "ogg";
                else if (recordedType.includes("wav")) extension = "wav";

                const newAtt: Attachment = {
                  id: uuidv7(),
                  mimeType: recordedType,
                  data: base64Data,
                  fileName: `Voice Note ${new Date().toLocaleTimeString().replace(/:/g, "-")}.${extension}`,
                };
                appendAttachments([newAtt]);
              } catch (e) {
                logInputError("Failed to process audio attachment", e);
                if (
                  isMountedRef.current &&
                  recordingSessionRef.current === sessionId
                ) {
                  setErrorMsg(t("failedToProcessAudio"));
                }
              }
            }
          };

          mediaRecorder.start();
          recordingKindRef.current = "media";
          setIsRecording(true);
          setRecordingSeconds(0);
          clearRecordingTimer();
          timerRef.current = setInterval(() => {
            setRecordingSeconds((prev) => prev + 1);
          }, 1000);
        } catch (e) {
          logInputError("Failed to access microphone", e);
          releaseMediaStream(stream);
          mediaRecorderRef.current = null;
          recordingKindRef.current = null;
          if (
            isMountedRef.current &&
            recordingSessionRef.current === sessionId
          ) {
            setErrorMsg(t("failedToAccessMicrophone"));
          }
        }
      }
    };

    const stopRecording = () => {
      if (recordingKindRef.current === "browser") {
        recordingSessionRef.current += 1;
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {
            // Recognition can already be inactive by the time the UI stops it.
          }
          recognitionRef.current = null;
        }
      } else if (recordingKindRef.current === "media") {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== "inactive"
        ) {
          try {
            mediaRecorderRef.current.stop();
          } catch {
            releaseMediaStream();
            mediaRecorderRef.current = null;
          }
        } else {
          releaseMediaStream();
          mediaRecorderRef.current = null;
        }
      }
      recordingKindRef.current = null;
      if (isMountedRef.current) {
        setIsRecording(false);
      }
      clearRecordingTimer();
    };

    const toggleRecording = () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputEl = e.currentTarget;
      if (inputEl.files && inputEl.files.length > 0) {
        const runId = fileSelectionRunRef.current + 1;
        fileSelectionRunRef.current = runId;
        const files = Array.from(inputEl.files) as File[];
        const selection = selectChatAttachmentFiles(attachments.length, files);
        const selectionMessage =
          getChatAttachmentFileSelectionMessage(selection);
        if (selectionMessage) setErrorMsg(selectionMessage);
        const newAttachments: Attachment[] = [];

        setIsParsingAttachments(true);
        try {
          for (const file of selection.accepted) {
            try {
              if (isNativeMediaFile(file)) {
                const base64 = await fileToBase64(file);
                if (
                  !isMountedRef.current ||
                  fileSelectionRunRef.current !== runId
                ) {
                  return;
                }
                const base64Data = base64.split(",")[1];

                newAttachments.push({
                  id: uuidv7(),
                  mimeType: file.type || "application/octet-stream",
                  data: base64Data,
                  fileName: file.name,
                });
                continue;
              }

              const result = await createChatDocumentAttachment(file, {
                id: uuidv7(),
                rag,
              });
              if (
                !isMountedRef.current ||
                fileSelectionRunRef.current !== runId
              ) {
                return;
              }
              newAttachments.push(result.attachment);
            } catch (err) {
              if (
                !isMountedRef.current ||
                fileSelectionRunRef.current !== runId
              ) {
                return;
              }
              logInputError(
                isNativeMediaFile(file)
                  ? "Error reading file"
                  : "Error parsing document attachment",
                err,
              );
              setErrorMsg(
                t(
                  isNativeMediaFile(file)
                    ? "failedToReadFile"
                    : "failedToParseDocument",
                  { fileName: file.name },
                ),
              );
            }
          }

          if (isMountedRef.current && fileSelectionRunRef.current === runId) {
            appendAttachments(newAttachments);
            if (inputEl.value) inputEl.value = ""; // Reset input
            setShowAttachMenu(false);
          }
        } finally {
          if (isMountedRef.current && fileSelectionRunRef.current === runId) {
            setIsParsingAttachments(false);
          }
        }
      }
    };

    const handleTextFallbackSelect = async (
      e: React.ChangeEvent<HTMLInputElement>,
    ) => {
      const inputEl = e.currentTarget;
      if (inputEl.files && inputEl.files.length > 0) {
        const runId = fileSelectionRunRef.current + 1;
        fileSelectionRunRef.current = runId;
        const files = Array.from(inputEl.files) as File[];
        const selection = selectChatAttachmentFiles(attachments.length, files);
        const selectionMessage =
          getChatAttachmentFileSelectionMessage(selection);
        if (selectionMessage) setErrorMsg(selectionMessage);
        const newAttachments: Attachment[] = [];

        setIsParsingAttachments(true);
        try {
          for (const file of selection.accepted) {
            try {
              const result = await createChatDocumentAttachment(file, {
                id: uuidv7(),
                rag,
              });
              if (
                !isMountedRef.current ||
                fileSelectionRunRef.current !== runId
              ) {
                return;
              }
              newAttachments.push(result.attachment);
            } catch (err) {
              if (
                !isMountedRef.current ||
                fileSelectionRunRef.current !== runId
              ) {
                return;
              }
              logInputError("Error parsing text or document file", err);
              setErrorMsg(t("failedToParseDocument", { fileName: file.name }));
            }
          }

          if (
            newAttachments.length > 0 &&
            isMountedRef.current &&
            fileSelectionRunRef.current === runId
          ) {
            appendAttachments(newAttachments);
          }
          if (isMountedRef.current && fileSelectionRunRef.current === runId) {
            if (inputEl.value) inputEl.value = "";
          }
        } finally {
          if (isMountedRef.current && fileSelectionRunRef.current === runId) {
            setIsParsingAttachments(false);
          }
        }
      }
    };

    const removeAttachment = (id: string) => {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    };

    const fileToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });
    };

    const handleKBSelect = (selectedAttachments: Attachment[]) => {
      appendAttachments(selectedAttachments);
    };

    // Adjust textarea height
    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height =
          textareaRef.current.scrollHeight + "px";
      }
    }, [input]);

    const formatTime = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const currentModelName =
      availableModels.find((m) => m.name === selectedModel)?.displayName ||
      selectedModel ||
      t("noModelSelected");
    const hasKnowledgeAttachments = attachments.some(isKnowledgeAttachment);
    const hasAttachmentMenu =
      modelCapabilities.attachment || modelCapabilities.vision;
    const isInputBusy = disabled || isTranscribing || isParsingAttachments;

    const handleAttachClick = () => {
      if (!hasAttachmentMenu) {
        // Fallback Mode: Open restricted file picker immediately
        textFallbackInputRef.current?.click();
      }
    };

    return (
      <div
        className="glass-shell relative flex flex-col rounded-xl border focus-within:ring-2 focus-within:ring-red-100/50 dark:focus-within:ring-red-900/30 focus-within:border-red-400/50 transition-[background-color,border-color,box-shadow] duration-200"
        aria-busy={isInputBusy}
      >
        {/* Modals */}
        {showRemoteModal && (
          <RemoteFileModal
            onClose={() => setShowRemoteModal(false)}
            onAttach={(att) => appendAttachments([att])}
            capabilities={modelCapabilities}
          />
        )}

        {showKBModal && (
          <KnowledgeSelectionModal
            onClose={() => setShowKBModal(false)}
            onSelect={handleKBSelect}
          />
        )}

        {/* Error Message Toast */}
        {errorMsg && (
          <div
            id={errorMessageId}
            role="status"
            aria-live="polite"
            className="absolute -top-10 left-0 right-0 flex justify-center z-50 animate-in fade-in slide-in-from-bottom-2"
          >
            <div className="bg-red-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg font-medium flex items-center gap-2 dark:bg-red-500">
              <button
                type="button"
                aria-label={t("dismissError")}
                className={`rounded-full p-0.5 hover:bg-white/15 transition-colors ${iconButtonFocusClass}`}
                onClick={() => setErrorMsg(null)}
              >
                <X size={12} aria-hidden="true" />
              </button>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {!errorMsg && isParsingAttachments && (
          <div
            role="status"
            aria-live="polite"
            className="absolute -top-10 left-0 right-0 z-50 flex justify-center animate-in fade-in slide-in-from-bottom-2"
          >
            <div className="flex items-center gap-2 rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-muted dark:text-foreground">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              <span>{t("parsingDocument")}</span>
            </div>
          </div>
        )}

        {/* Attachments Preview Area */}
        <MessageInputAttachmentTray
          attachments={attachments}
          onRemove={removeAttachment}
          ariaLabel={t("attachedFiles")}
        />

        {/* Text Input */}
        <label htmlFor={messageInputId} className="sr-only">
          {t("message")}
        </label>
        <textarea
          id={messageInputId}
          name="message"
          ref={textareaRef}
          className="w-full px-4 pt-3 pb-1 bg-transparent focus:outline-0 text-gray-800 dark:text-foreground placeholder-gray-500 dark:placeholder:text-muted-foreground resize-none max-h-32 md:max-h-48 text-(length:--neo-font-size-base) min-h-12"
          placeholder={
            isRecording
              ? voice.sttProvider === "browser"
                ? t("listening")
                : t("recording")
              : t("askAnything")
          }
          autoComplete="off"
          aria-describedby={errorMsg ? errorMessageId : undefined}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isInputBusy}
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 p-1 md:p-2">
          <div className="flex min-w-0 items-center gap-0.5">
            {/* Attachment Menu */}
            <div className="relative">
              <input
                id={attachFileInputId}
                name="chat-attachments"
                aria-label={t("uploadFilesAria")}
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                multiple
                accept="*/*"
              />
              <input
                id={attachImageInputId}
                name="chat-images"
                aria-label={t("uploadImagesAria")}
                type="file"
                ref={imageInputRef}
                onChange={handleFileSelect}
                className="hidden"
                multiple
                accept="image/*"
              />
              {/* Fallback Input for dumb models */}
              <input
                id={attachTextFallbackInputId}
                name="chat-text-attachments"
                aria-label={t("uploadTextFilesAria")}
                type="file"
                ref={textFallbackInputRef}
                onChange={handleTextFallbackSelect}
                className="hidden"
                multiple
                accept="text/*,application/json,application/xml,application/javascript,application/xhtml+xml,application/x-yaml,application/sql,application/graphql,application/ld+json,application/x-sh,application/x-httpd-php,application/typescript,.csv,.doc,.docx,.md,.markdown,.pdf,.ppt,.pptx,.txt,.xls,.xlsx"
              />

              <DropdownMenu
                open={showAttachMenu && hasAttachmentMenu}
                onOpenChange={(open) => {
                  setShowSkillSelect(false);
                  setShowPluginSelect(false);
                  setShowModelSelect(false);
                  setShowAttachMenu(hasAttachmentMenu ? open : false);
                }}
              >
                <Tooltip content={t("attach")} position="top">
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("attachFiles")}
                      className={`${iconButtonBaseClass} transition-colors ${iconButtonFocusClass} ${showAttachMenu ? "bg-gray-100 dark:bg-accent text-gray-800 dark:text-foreground" : "text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent/50"}`}
                      onClick={handleAttachClick}
                      disabled={isInputBusy}
                    >
                      <Paperclip size={16} aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                </Tooltip>

                <DropdownMenuContent side="top" align="start" className="w-44">
                  {modelCapabilities.attachment && (
                    <DropdownMenuItem
                      onSelect={() => {
                        fileInputRef.current?.click();
                      }}
                    >
                      <FileUp
                        size={14}
                        className="text-blue-500"
                        aria-hidden="true"
                      />
                      <span>{t("uploadFile")}</span>
                    </DropdownMenuItem>
                  )}
                  {modelCapabilities.vision && (
                    <DropdownMenuItem
                      onSelect={() => {
                        imageInputRef.current?.click();
                      }}
                    >
                      <ImageUp
                        size={14}
                        className="text-green-500"
                        aria-hidden="true"
                      />
                      <span>{t("uploadImage")}</span>
                    </DropdownMenuItem>
                  )}

                  {(modelCapabilities.attachment ||
                    modelCapabilities.vision ||
                    modelCapabilities.audio) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          setShowRemoteModal(true);
                        }}
                      >
                        <Link
                          size={14}
                          className="text-purple-500"
                          aria-hidden="true"
                        />
                        <span>{t("remoteFile")}</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Knowledge Base Button */}
            <div className="relative" ref={knowledgeButtonRef}>
              <Tooltip content={t("knowledgeBase")} position="top">
                <button
                  id={knowledgeButtonId}
                  type="button"
                  aria-label={t("knowledgeBase")}
                  aria-haspopup="dialog"
                  aria-pressed={hasKnowledgeAttachments}
                  className={`${iconButtonBaseClass} transition-colors ${iconButtonFocusClass} ${
                    hasKnowledgeAttachments
                      ? "bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/30"
                      : "text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent/50"
                  }`}
                  onClick={() => {
                    setShowAttachMenu(false);
                    setShowSkillSelect(false);
                    setShowPluginSelect(false);
                    setShowModelSelect(false);
                    setShowKBModal(true);
                  }}
                  disabled={isInputBusy}
                >
                  <Library size={16} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>

            {/* Skill Toggle Button */}
            <div className="relative">
              <DropdownMenu
                open={showSkillSelect}
                onOpenChange={(open) => {
                  setShowAttachMenu(false);
                  setShowPluginSelect(false);
                  setShowModelSelect(false);
                  setShowSkillSelect(open);
                }}
              >
                <Tooltip
                  content={
                    activeSkillIds.length > 0
                      ? t("activeSkillsCount", { count: activeSkillIds.length })
                      : t("skills")
                  }
                  position="top"
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={
                        activeSkillIds.length > 0
                          ? t("activeSkillsAria", {
                              count: activeSkillIds.length,
                            })
                          : t("skills")
                      }
                      className={`${iconButtonBaseClass} transition-colors ${iconButtonFocusClass} ${
                        activeSkillIds.length > 0
                          ? "text-emerald-500 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-muted-foreground dark:hover:bg-accent/50 dark:hover:text-foreground"
                      }`}
                      disabled={isInputBusy}
                    >
                      <Sparkles size={16} aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                </Tooltip>

                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="max-h-64 w-64 overflow-y-auto custom-scrollbar"
                >
                  {skillsForMenu.length > 0 ? (
                    <>
                      <DropdownMenuLabel>
                        {t("installedSkills")}
                      </DropdownMenuLabel>
                      {skillsForMenu.map((skill) => {
                        const isActive = activeSkillSet.has(skill.id);
                        return (
                          <DropdownMenuCheckboxItem
                            key={skill.id}
                            checked={isActive}
                            indicatorPosition="right"
                            indicator={
                              <span className="flex h-3 w-3 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500">
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              </span>
                            }
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={() => toggleSessionSkill(skill.id)}
                          >
                            <span className="truncate">{skill.title}</span>
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </>
                  ) : (
                    <div
                      className="px-3 py-4 text-center text-xs text-muted-foreground"
                      role="status"
                    >
                      {t("noSkillsAvailable")}
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Plugin Toggle Button */}
            <div className="relative">
              <DropdownMenu
                open={showPluginSelect}
                onOpenChange={(open) => {
                  setShowAttachMenu(false);
                  setShowSkillSelect(false);
                  setShowModelSelect(false);
                  setShowPluginSelect(open);
                }}
              >
                <Tooltip
                  content={
                    activePlugins.length > 0
                      ? t("activePluginsCount", { count: activePlugins.length })
                      : t("plugins")
                  }
                  position="top"
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={
                        activePlugins.length > 0
                          ? t("activePluginsAria", {
                              count: activePlugins.length,
                            })
                          : t("plugins")
                      }
                      className={`${iconButtonBaseClass} transition-colors ${iconButtonFocusClass} ${activePlugins.length > 0 ? "text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20" : "text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent/50"}`}
                      disabled={isInputBusy}
                    >
                      <Blocks size={16} aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                </Tooltip>

                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="max-h-64 w-64 overflow-y-auto custom-scrollbar"
                >
                  {validPlugins.length > 0 ? (
                    <>
                      <DropdownMenuLabel>
                        {t("installedPlugins")}
                      </DropdownMenuLabel>
                      {validPlugins.map((plugin) => {
                        const isActive = activePlugins.includes(plugin.id);
                        return (
                          <DropdownMenuCheckboxItem
                            checked={isActive}
                            aria-label={
                              isActive
                                ? t("disablePlugin", { title: plugin.title })
                                : t("enablePlugin", { title: plugin.title })
                            }
                            indicatorPosition="right"
                            indicator={
                              <span className="flex h-3 w-3 items-center justify-center rounded-full border border-blue-500 bg-blue-500">
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              </span>
                            }
                            key={plugin.id}
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={() =>
                              togglePluginActive(plugin.id)
                            }
                          >
                            <span className="flex min-w-0 items-center gap-2 truncate">
                              <SafeImage
                                src={plugin.logoUrl}
                                className="w-4 h-4 object-contain"
                                alt=""
                                fallback={
                                  <Blocks size={14} aria-hidden="true" />
                                }
                              />
                              <span className="truncate">{plugin.title}</span>
                            </span>
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </>
                  ) : (
                    <div
                      className="px-3 py-4 text-center text-xs text-muted-foreground"
                      role="status"
                    >
                      {installedPlugins.length > 0
                        ? t("pluginsMissingAuth")
                        : t("noPluginsInstalled")}{" "}
                      <br /> {t("visitPluginMarket")}
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Reasoning Button (Conditional) */}
            {isReasoningSupported && (
              <Tooltip
                content={
                  chatConfig.useReasoning
                    ? t("disableReasoning")
                    : t("enableReasoning")
                }
                position="top"
              >
                <button
                  type="button"
                  aria-label={
                    chatConfig.useReasoning
                      ? t("disableReasoningAria")
                      : t("enableReasoningAria")
                  }
                  aria-pressed={chatConfig.useReasoning}
                  className={`${iconButtonBaseClass} transition-colors ${iconButtonFocusClass} ${chatConfig.useReasoning ? "text-violet-500 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20" : "text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent/50"}`}
                  onClick={() =>
                    setChatConfig({ useReasoning: !chatConfig.useReasoning })
                  }
                  disabled={isInputBusy}
                >
                  <Lightbulb size={16} aria-hidden="true" />
                </button>
              </Tooltip>
            )}

            {/* Search Button */}
            {onToggleSearch && (
              <Tooltip content={searchTooltip} position="top">
                <button
                  type="button"
                  aria-label={
                    !searchCompatibility.enabled
                      ? getSearchUnavailableMessage(searchCompatibility.reason)
                      : isSearchEnabled
                        ? t("disableSearchAria")
                        : t("enableSearchAria")
                  }
                  aria-disabled={!searchCompatibility.enabled || undefined}
                  aria-pressed={isSearchEnabled && searchCompatibility.enabled}
                  className={`${iconButtonBaseClass} transition-colors ${iconButtonFocusClass} ${
                    isSearchEnabled && searchCompatibility.enabled
                      ? "text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      : !searchCompatibility.enabled
                        ? "text-amber-500 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                        : "text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent/50"
                  }`}
                  onClick={handleSearchToggle}
                  disabled={isInputBusy}
                >
                  <Globe size={16} aria-hidden="true" />
                </button>
              </Tooltip>
            )}

            {/* HTML Visual Prompt Button */}
            <Tooltip
              content={
                system.enableHtmlVisualPrompt
                  ? t("htmlVisualPromptEnabled")
                  : t("htmlVisualPromptDisabled")
              }
              position="top"
            >
              <button
                type="button"
                aria-label={
                  system.enableHtmlVisualPrompt
                    ? t("disableHtmlVisualPromptAria")
                    : t("enableHtmlVisualPromptAria")
                }
                aria-pressed={system.enableHtmlVisualPrompt}
                className={`${iconButtonBaseClass} transition-colors ${iconButtonFocusClass} ${
                  system.enableHtmlVisualPrompt
                    ? "text-brand hover:bg-brand-soft dark:text-brand"
                    : "text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent/50"
                }`}
                onClick={() =>
                  updateSystemSettings({
                    enableHtmlVisualPrompt: !system.enableHtmlVisualPrompt,
                  })
                }
                disabled={isInputBusy}
              >
                <LayoutDashboard size={16} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {/* Model Selector */}
            <div className="relative">
              <DropdownMenu
                open={showModelSelect && availableModels.length > 0}
                onOpenChange={(open) => {
                  setShowAttachMenu(false);
                  setShowSkillSelect(false);
                  setShowPluginSelect(false);
                  setShowModelSelect(open && availableModels.length > 0);
                }}
              >
                <Tooltip content={currentModelName} position="top">
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("selectModelAria", {
                        model: currentModelName,
                      })}
                      className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 md:w-auto md:max-w-52 dark:text-muted-foreground dark:hover:bg-accent/50 dark:hover:text-foreground ${iconButtonFocusClass}`}
                      disabled={isInputBusy}
                    >
                      {/* Mobile: Just Icon */}
                      <Cpu size={16} className="md:hidden" aria-hidden="true" />

                      {/* Desktop: Text + Chevron */}
                      <div className="hidden min-w-0 items-center gap-0.5 md:flex">
                        <span className="max-w-44 truncate text-xs font-medium">
                          {truncateMiddle(currentModelName, 30)}
                        </span>
                        <ChevronDown
                          size={12}
                          aria-hidden="true"
                          className={`opacity-50 transition-[opacity,transform] duration-200 group-hover:opacity-100 ${showModelSelect ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                </Tooltip>

                <DropdownMenuContent
                  side="top"
                  align="end"
                  className="max-h-64 w-56 overflow-y-auto custom-scrollbar"
                >
                  <DropdownMenuRadioGroup
                    value={selectedModel}
                    onValueChange={(model) => {
                      onSelectModel?.(model);
                      setShowModelSelect(false);
                    }}
                  >
                    {(
                      Object.entries(groupedModels) as [string, ModelInfo[]][]
                    ).map(([providerName, models]) => (
                      <div key={providerName}>
                        <DropdownMenuLabel>{providerName}</DropdownMenuLabel>
                        {models.map((model) => (
                          <DropdownMenuRadioItem
                            value={model.name}
                            aria-label={t("useModelAria", {
                              model: model.displayName,
                            })}
                            indicatorPosition="right"
                            key={model.name}
                            className={
                              selectedModel === model.name
                                ? "font-medium text-brand"
                                : undefined
                            }
                          >
                            <span className="truncate">
                              {model.displayName}
                            </span>
                          </DropdownMenuRadioItem>
                        ))}
                      </div>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Text Polish Button */}
            <Tooltip
              content={isPolishingInput ? t("polishingText") : t("polishText")}
              position="top"
            >
              <button
                type="button"
                aria-label={t("polishTextAria")}
                aria-busy={isPolishingInput || undefined}
                disabled={isInputBusy || isPolishingInput || !input.trim()}
                className={`${iconButtonBaseClass} transition-colors ${iconButtonFocusClass} ${
                  input.trim()
                    ? "text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent/50"
                    : "text-gray-300 dark:text-muted-foreground/40"
                } disabled:cursor-not-allowed disabled:opacity-50`}
                onClick={handlePolishInput}
              >
                {isPolishingInput ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <PencilSparkles size={16} aria-hidden="true" />
                )}
              </button>
            </Tooltip>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1">
              {isInputBusy ? (
                onStop && !isParsingAttachments ? (
                  <Tooltip content={t("stopGeneration")} position="top">
                    <button
                      type="button"
                      aria-label={t("stopGenerationAria")}
                      aria-busy="true"
                      className={`${iconButtonBaseClass} relative overflow-hidden bg-gray-100 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500 dark:bg-accent dark:text-muted-foreground dark:hover:bg-red-900/20 dark:hover:text-red-400 group ${iconButtonFocusClass}`}
                      onClick={onStop}
                    >
                      <div className="relative w-4 h-4">
                        <Loader2
                          size={16}
                          aria-hidden="true"
                          className="animate-spin absolute inset-0 transition-[opacity,transform] duration-300 group-hover:opacity-0 group-hover:scale-75"
                        />
                        <Square
                          size={16}
                          fill="currentColor"
                          aria-hidden="true"
                          className="absolute inset-0 opacity-0 scale-75 transition-[opacity,transform] duration-300 group-hover:opacity-100 group-hover:scale-100"
                        />
                      </div>
                    </button>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    aria-label={t("working")}
                    aria-busy="true"
                    className={`${iconButtonBaseClass} cursor-not-allowed bg-transparent text-gray-500 dark:text-muted-foreground`}
                  >
                    <Loader2
                      size={16}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  </button>
                )
              ) : input || attachments.length > 0 ? (
                <Tooltip content={t("sendMessage")} position="top">
                  <button
                    type="button"
                    aria-label={t("sendMessageAria")}
                    disabled={!selectedModel || isParsingAttachments}
                    className={`${iconButtonBaseClass} bg-gray-100 text-gray-500 shadow-sm transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-accent dark:text-muted-foreground dark:hover:bg-accent/80 ${iconButtonFocusClass}`}
                    onClick={handleSend}
                  >
                    <SendHorizontal size={16} aria-hidden="true" />
                  </button>
                </Tooltip>
              ) : (
                <div className="relative">
                  {isRecording && (
                    <div
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse whitespace-nowrap shadow-md dark:bg-red-500"
                      aria-hidden="true"
                    >
                      {formatTime(recordingSeconds)}
                    </div>
                  )}

                  <Tooltip
                    content={
                      isRecording
                        ? t("stopRecording")
                        : voice.autoTranscribe
                          ? t("speechToText")
                          : t("voiceMessage")
                    }
                    position="top"
                  >
                    <button
                      type="button"
                      aria-label={
                        isRecording
                          ? t("stopRecordingAria", {
                              time: formatTime(recordingSeconds),
                            })
                          : voice.autoTranscribe
                            ? t("speechToTextAria")
                            : t("voiceMessageAria")
                      }
                      aria-pressed={isRecording}
                      className={`${iconButtonBaseClass} transition-[background-color,color,box-shadow] ${iconButtonFocusClass} ${isRecording ? "bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-800" : "text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent/50"}`}
                      onClick={toggleRecording}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        updateVoiceSettings({
                          autoTranscribe: !voice.autoTranscribe,
                        });
                      }}
                    >
                      {isRecording ? (
                        <StopCircle size={16} aria-hidden="true" />
                      ) : (
                        <Mic size={16} aria-hidden="true" />
                      )}
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);

MessageInput.displayName = "MessageInput";

export default MessageInput;
