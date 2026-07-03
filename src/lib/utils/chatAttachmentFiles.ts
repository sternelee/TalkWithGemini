import { ATTACHMENT_LIMITS, formatBytes } from "../../config/limits";

export interface ChatAttachmentFileCandidate {
  name: string;
  size: number;
}

export interface ChatAttachmentFileSelection<
  T extends ChatAttachmentFileCandidate,
> {
  accepted: T[];
  rejectedByCount: T[];
  rejectedBySize: T[];
}

export function selectChatAttachmentFiles<
  T extends ChatAttachmentFileCandidate,
>(existingCount: number, candidates: T[]): ChatAttachmentFileSelection<T> {
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

export function getChatAttachmentFileSelectionMessage(
  selection: Pick<
    ChatAttachmentFileSelection<ChatAttachmentFileCandidate>,
    "rejectedByCount" | "rejectedBySize"
  >,
): string {
  const messages: string[] = [];

  if (selection.rejectedByCount.length > 0) {
    messages.push(
      `Attachment limit reached (${ATTACHMENT_LIMITS.maxCount} max).`,
    );
  }

  if (selection.rejectedBySize.length === 1) {
    messages.push(
      `File "${selection.rejectedBySize[0].name}" exceeds ${formatBytes(
        ATTACHMENT_LIMITS.maxFileBytes,
      )}.`,
    );
  } else if (selection.rejectedBySize.length > 1) {
    messages.push(
      `Skipped ${selection.rejectedBySize.length} file(s): each file must be ${formatBytes(
        ATTACHMENT_LIMITS.maxFileBytes,
      )} or smaller.`,
    );
  }

  return messages.join(" ");
}
