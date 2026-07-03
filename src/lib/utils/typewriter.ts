export interface TypewriterFrame {
  content: string;
  done: boolean;
}

export function getNextTypewriterFrame(
  currentContent: string,
  targetContent: string,
  maxChunkSize: number = 5,
): TypewriterFrame {
  if (!targetContent) {
    return { content: "", done: true };
  }

  const safeChunkSize = Math.max(1, Math.floor(maxChunkSize));
  const currentLength = targetContent.startsWith(currentContent)
    ? currentContent.length
    : 0;

  if (currentLength >= targetContent.length) {
    return { content: targetContent, done: true };
  }

  const remaining = targetContent.length - currentLength;
  const chunkSize = Math.min(remaining, safeChunkSize);
  const content = targetContent.slice(0, currentLength + chunkSize);

  return {
    content,
    done: content.length >= targetContent.length,
  };
}
