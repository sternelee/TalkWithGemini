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

interface ChatAttachmentFileSelectionOptions {
  maxFileBytes?: number;
}

type FileListLike = Iterable<File> | ArrayLike<File>;

interface ClipboardItemLike {
  kind?: string;
  getAsFile?: () => File | null;
}

interface ClipboardDataLike {
  items?: ArrayLike<ClipboardItemLike> | null;
  files?: FileListLike | null;
}

interface DropDataLike {
  files?: FileListLike | null;
  items?: ArrayLike<ClipboardItemLike> | null;
}

function filesFromList(files: FileListLike | null | undefined): File[] {
  return files ? Array.from(files) : [];
}

function filesFromItems(
  items: ArrayLike<ClipboardItemLike> | null | undefined,
): File[] {
  if (!items) return [];

  return Array.from(items).flatMap((item) => {
    if (item.kind && item.kind !== "file") return [];
    const file = item.getAsFile?.();
    return file ? [file] : [];
  });
}

export function extractChatAttachmentFilesFromDrop(
  dataTransfer: DropDataLike,
): File[] {
  const files = filesFromList(dataTransfer.files);
  return files.length > 0 ? files : filesFromItems(dataTransfer.items);
}

export function extractChatAttachmentFilesFromClipboard(
  clipboardData: ClipboardDataLike,
): File[] {
  const itemFiles = filesFromItems(clipboardData.items);
  return itemFiles.length > 0 ? itemFiles : filesFromList(clipboardData.files);
}

export function selectChatAttachmentFiles<
  T extends ChatAttachmentFileCandidate,
>(
  existingCount: number,
  candidates: T[],
  options: ChatAttachmentFileSelectionOptions = {},
): ChatAttachmentFileSelection<T> {
  const accepted: T[] = [];
  const rejectedByCount: T[] = [];
  const rejectedBySize: T[] = [];
  const maxFileBytes = options.maxFileBytes ?? ATTACHMENT_LIMITS.maxFileBytes;

  for (const candidate of candidates) {
    if (candidate.size > maxFileBytes) {
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
  options: ChatAttachmentFileSelectionOptions = {},
): string {
  const messages: string[] = [];
  const maxFileBytes = options.maxFileBytes ?? ATTACHMENT_LIMITS.maxFileBytes;

  if (selection.rejectedByCount.length > 0) {
    messages.push(
      `Attachment limit reached (${ATTACHMENT_LIMITS.maxCount} max).`,
    );
  }

  if (selection.rejectedBySize.length === 1) {
    messages.push(
      `File "${selection.rejectedBySize[0].name}" exceeds ${formatBytes(
        maxFileBytes,
      )}.`,
    );
  } else if (selection.rejectedBySize.length > 1) {
    messages.push(
      `Skipped ${selection.rejectedBySize.length} file(s): each file must be ${formatBytes(
        maxFileBytes,
      )} or smaller.`,
    );
  }

  return messages.join(" ");
}
