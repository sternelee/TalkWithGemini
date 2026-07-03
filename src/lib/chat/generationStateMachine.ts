import type {
  BackgroundTaskSnapshot,
  ChatGenerationEvent,
  ChatGenerationState,
  ChatPipelinePhase,
  ChatPipelinePhaseState,
  ChatPipelineState,
  ChatPipelineStatus,
  Message,
} from "@/types";

const PIPELINE_PHASES: ChatPipelinePhase[] = [
  "attachments",
  "rag",
  "search",
  "plugins",
  "model",
];

function createPipelineStatus(
  phase: ChatPipelinePhase,
  state: ChatPipelinePhaseState = "idle",
  message?: string,
): ChatPipelineStatus {
  return { phase, state, ...(message ? { message } : {}) };
}

export function createInitialPipelineState(): ChatPipelineState {
  return {
    attachments: createPipelineStatus("attachments"),
    rag: createPipelineStatus("rag"),
    search: createPipelineStatus("search"),
    plugins: createPipelineStatus("plugins"),
    model: createPipelineStatus("model"),
  };
}

export function pipelineStateToStatuses(
  pipeline: ChatPipelineState,
): ChatPipelineStatus[] {
  return PIPELINE_PHASES.map((phase) => pipeline[phase]);
}

export function createInitialChatGenerationState(): ChatGenerationState {
  return {
    status: "idle",
    pipeline: createInitialPipelineState(),
    stopRequested: false,
  };
}

function updatePipelinePhase(
  pipeline: ChatPipelineState,
  phase: ChatPipelinePhase,
  state: ChatPipelinePhaseState,
  message?: string,
): ChatPipelineState {
  return {
    ...pipeline,
    [phase]: createPipelineStatus(phase, state, message),
  };
}

function isStaleRun(
  state: ChatGenerationState,
  event: Exclude<ChatGenerationEvent, { type: "reset" | "start" }>,
): boolean {
  return state.activeRunId !== event.runId;
}

export function reduceChatGenerationState(
  state: ChatGenerationState,
  event: ChatGenerationEvent,
): ChatGenerationState {
  if (event.type === "reset") return createInitialChatGenerationState();

  if (event.type === "start") {
    return {
      status: "pending",
      activeRunId: event.runId,
      sessionId: event.sessionId,
      userMessageId: event.userMessageId,
      pipeline: createInitialPipelineState(),
      stopRequested: false,
    };
  }

  if (isStaleRun(state, event)) return state;

  switch (event.type) {
    case "pipeline":
      return {
        ...state,
        status:
          event.phaseState === "running"
            ? event.phase === "search"
              ? "searching"
              : event.phase === "plugins"
                ? "tool"
                : event.phase
            : state.status,
        pipeline: updatePipelinePhase(
          state.pipeline,
          event.phase,
          event.phaseState,
          event.message,
        ),
      };
    case "optional-capability-failed":
      return {
        ...state,
        pipeline: updatePipelinePhase(
          state.pipeline,
          event.phase,
          "error",
          event.message,
        ),
      };
    case "stream-started":
      return {
        ...state,
        status: "model",
        modelMessageId: event.modelMessageId,
        pipeline: updatePipelinePhase(state.pipeline, "model", "running"),
      };
    case "stop-requested":
      return {
        ...state,
        status: "aborted",
        stopRequested: true,
      };
    case "completed":
      return {
        ...state,
        status: "done",
        stopRequested: false,
        pipeline: updatePipelinePhase(state.pipeline, "model", "success"),
      };
    case "failed":
      return {
        ...state,
        status: "error",
        stopRequested: false,
        error: {
          message: event.error,
          ...(event.recoverable !== undefined
            ? { recoverable: event.recoverable }
            : {}),
          ...(event.code ? { code: event.code } : {}),
        },
        pipeline: updatePipelinePhase(
          state.pipeline,
          "model",
          "error",
          event.error,
        ),
      };
    case "aborted":
      return {
        ...state,
        status: "aborted",
        stopRequested: false,
      };
    default:
      return state;
  }
}

export function createBackgroundTaskSnapshot(
  snapshot: BackgroundTaskSnapshot,
): BackgroundTaskSnapshot {
  return { ...snapshot };
}

export function shouldApplyBackgroundTaskSnapshot(
  snapshot: BackgroundTaskSnapshot,
  current: {
    runId: number;
    currentSessionId: string | null | undefined;
    currentMessage?: Pick<Message, "id" | "content"> | null;
    currentSessionUpdatedAt?: number;
  },
): boolean {
  if (snapshot.runId !== current.runId) return false;
  if (snapshot.sessionId !== current.currentSessionId) return false;
  if (!current.currentMessage) return false;
  if (snapshot.messageId !== current.currentMessage.id) return false;
  if (snapshot.messageContent !== current.currentMessage.content) return false;
  if (
    snapshot.sessionUpdatedAt !== undefined &&
    current.currentSessionUpdatedAt !== undefined &&
    snapshot.sessionUpdatedAt !== current.currentSessionUpdatedAt
  ) {
    return false;
  }
  return true;
}
