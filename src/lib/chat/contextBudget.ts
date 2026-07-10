export interface ContextBudgetSources {
  history?: number;
  attachments?: number;
  search?: number;
  rag?: number;
  tools?: number;
}

export interface ContextBudgetInput {
  modelInputTokenLimit?: number;
  reservedOutputTokens?: number;
  sources: ContextBudgetSources;
}

export interface ContextBudgetAllocation {
  requestedTokens: number;
  maxTokens: number;
}

export interface ContextBudgetPlan {
  totalAvailableTokens: number;
  totalAllocatedTokens: number;
  allocations: Record<
    keyof Required<ContextBudgetSources>,
    ContextBudgetAllocation
  >;
}

const DEFAULT_CONTEXT_LIMIT = 32_000;
const DEFAULT_RESERVED_OUTPUT = 2_000;
const FALLBACK_CHARS_PER_TOKEN = 4;

const SOURCE_WEIGHTS: Record<keyof Required<ContextBudgetSources>, number> = {
  history: 0.46,
  attachments: 0.18,
  search: 0.14,
  rag: 0.14,
  tools: 0.08,
};

export function estimateContextTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / FALLBACK_CHARS_PER_TOKEN);
}

export function trimTextToEstimatedTokens(
  text: string,
  maxTokens: number,
): string {
  if (!text || maxTokens <= 0) return "";
  const maxChars = maxTokens * FALLBACK_CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function toRequestedTokens(value?: number): number {
  if (!value || value <= 0) return 0;
  return estimateContextTokens("x".repeat(value));
}

export function allocateContextBudget(
  input: ContextBudgetInput,
): ContextBudgetPlan {
  const totalAvailableTokens = Math.max(
    0,
    (input.modelInputTokenLimit || DEFAULT_CONTEXT_LIMIT) -
      (input.reservedOutputTokens || DEFAULT_RESERVED_OUTPUT),
  );

  const allocations = Object.fromEntries(
    (
      Object.keys(SOURCE_WEIGHTS) as Array<keyof Required<ContextBudgetSources>>
    ).map((source) => {
      const requestedTokens = toRequestedTokens(input.sources[source]);
      const weightedLimit = Math.floor(
        totalAvailableTokens * SOURCE_WEIGHTS[source],
      );
      return [
        source,
        {
          requestedTokens,
          maxTokens: Math.min(requestedTokens, weightedLimit),
        },
      ];
    }),
  ) as ContextBudgetPlan["allocations"];

  const totalAllocatedTokens = Object.values(allocations).reduce(
    (sum, allocation) => sum + allocation.maxTokens,
    0,
  );

  return {
    totalAvailableTokens,
    totalAllocatedTokens,
    allocations,
  };
}
