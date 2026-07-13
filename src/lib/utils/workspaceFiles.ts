import { ATTACHMENT_LIMITS, formatBytes } from "@/config/limits";

export interface WorkspaceFileCandidate {
  name: string;
  size: number;
}

export interface WorkspaceFileSelectionResult<
  T extends WorkspaceFileCandidate,
> {
  accepted: T[];
  rejectedByCount: T[];
  rejectedBySize: T[];
}

export function selectWorkspaceFilesForUpload<T extends WorkspaceFileCandidate>(
  existingCount: number,
  candidates: T[],
): WorkspaceFileSelectionResult<T> {
  const accepted: T[] = [];
  const rejectedByCount: T[] = [];
  const rejectedBySize: T[] = [];

  for (const candidate of candidates) {
    if (candidate.size > ATTACHMENT_LIMITS.maxFileBytes) {
      rejectedBySize.push(candidate);
      continue;
    }

    if (existingCount + accepted.length >= ATTACHMENT_LIMITS.maxCount) {
      rejectedByCount.push(candidate);
      continue;
    }

    accepted.push(candidate);
  }

  return { accepted, rejectedByCount, rejectedBySize };
}

export function getWorkspaceFileSelectionMessage(
  selection: Pick<
    WorkspaceFileSelectionResult<WorkspaceFileCandidate>,
    "rejectedByCount" | "rejectedBySize"
  >,
): string {
  const messages: string[] = [];

  if (selection.rejectedByCount.length > 0) {
    messages.push(
      `Skipped ${selection.rejectedByCount.length} file(s): workspace preset files are limited to ${ATTACHMENT_LIMITS.maxCount}.`,
    );
  }

  if (selection.rejectedBySize.length > 0) {
    messages.push(
      `Skipped ${selection.rejectedBySize.length} file(s): each file must be ${formatBytes(ATTACHMENT_LIMITS.maxFileBytes)} or smaller.`,
    );
  }

  return messages.join(" ");
}
