export function createStreamingReplacement(originalText: string) {
  let nextText = "";

  return {
    append(chunk: string): string {
      nextText += chunk;
      return nextText;
    },
    value(): string {
      return nextText;
    },
    restore(): string {
      return originalText;
    },
  };
}
