import { formatBytes, KNOWLEDGE_LIMITS } from "@/config/limits";

export interface KnowledgeFileCandidate {
  name: string;
  size: number;
}

export interface KnowledgeFileSelectionResult<
  T extends KnowledgeFileCandidate,
> {
  accepted: T[];
  rejectedByCount: T[];
  rejectedByEmpty: T[];
  rejectedBySize: T[];
}

export function selectKnowledgeFilesForUpload<T extends KnowledgeFileCandidate>(
  existingCount: number,
  candidates: T[],
): KnowledgeFileSelectionResult<T> {
  const accepted: T[] = [];
  const rejectedByCount: T[] = [];
  const rejectedByEmpty: T[] = [];
  const rejectedBySize: T[] = [];

  for (const candidate of candidates) {
    if (candidate.size === 0) {
      rejectedByEmpty.push(candidate);
      continue;
    }

    if (candidate.size > KNOWLEDGE_LIMITS.maxFileBytes) {
      rejectedBySize.push(candidate);
      continue;
    }

    if (
      existingCount + accepted.length >=
      KNOWLEDGE_LIMITS.maxFilesPerCollection
    ) {
      rejectedByCount.push(candidate);
      continue;
    }

    accepted.push(candidate);
  }

  return { accepted, rejectedByCount, rejectedByEmpty, rejectedBySize };
}

export function getKnowledgeFileSelectionMessage(
  selection: Pick<
    KnowledgeFileSelectionResult<KnowledgeFileCandidate>,
    "rejectedByCount" | "rejectedByEmpty" | "rejectedBySize"
  >,
): string {
  const messages: string[] = [];

  if (selection.rejectedByCount.length > 0) {
    messages.push(
      `Skipped ${selection.rejectedByCount.length} file(s): collections are limited to ${KNOWLEDGE_LIMITS.maxFilesPerCollection} documents.`,
    );
  }

  if (selection.rejectedByEmpty.length > 0) {
    messages.push(`Skipped ${selection.rejectedByEmpty.length} empty file(s).`);
  }

  if (selection.rejectedBySize.length > 0) {
    messages.push(
      `Skipped ${selection.rejectedBySize.length} file(s): each document must be ${formatBytes(KNOWLEDGE_LIMITS.maxFileBytes)} or smaller.`,
    );
  }

  return messages.join(" ");
}
