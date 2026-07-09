import type { Attachment, Message } from "../../../types";

export function getMessagesContextLength(messages: Message[]): number {
  return messages.reduce((sum, message) => {
    const attachmentLength =
      message.attachments?.reduce(
        (attachmentSum, attachment) =>
          attachmentSum +
          (attachment.fileName?.length || 0) +
          (attachment.data?.length || 0) +
          (attachment.url?.length || 0),
        0,
      ) || 0;

    return (
      sum +
      message.content.length +
      (message.reasoning?.length || 0) +
      attachmentLength
    );
  }, 0);
}

export function getAttachmentsContextLength(attachments: Attachment[]): number {
  return attachments.reduce(
    (sum, attachment) =>
      sum +
      (attachment.fileName?.length || 0) +
      (attachment.data?.length || 0) +
      (attachment.url?.length || 0),
    0,
  );
}
