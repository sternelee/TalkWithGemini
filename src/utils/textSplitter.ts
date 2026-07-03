interface SplitterOptions {
  chunkSize: number;
  chunkOverlap: number;
  locale?: string;
}

export class SimpleRecursiveSplitter {
  private chunkSize: number;
  private chunkOverlap: number;
  private separators: string[];
  private segmenter?: Intl.Segmenter;

  constructor(options: SplitterOptions) {
    this.chunkSize = options.chunkSize;
    this.chunkOverlap = options.chunkOverlap;
    // Priority: Double newline -> Single newline -> End of sentence -> Space -> Character
    this.separators = ["\n\n", "\n", "。", "！", "？", ".", " ", ""];
    // Initialize Intl.Segmenter with word granularity to simulate token count
    this.segmenter =
      typeof Intl !== "undefined" && "Segmenter" in Intl
        ? new Intl.Segmenter(options.locale || "en-US", {
            granularity: "word",
          })
        : undefined;
  }

  /**
   * Simulates token counting using Intl.Segmenter with word granularity.
   * This provides a better approximation for LLM token limits than character count.
   */
  private getTokenCount(text: string): number {
    if (!text) return 0;

    if (!this.segmenter) {
      return Math.ceil(text.length / 4);
    }

    let count = 0;
    for (const segment of this.segmenter.segment(text)) {
      if (segment.isWordLike || segment.segment.trim()) {
        count += 1;
      }
    }

    return count;
  }

  public splitText(text: string, currentSeparators?: string[]): string[] {
    const finalChunks: string[] = [];
    const separators = currentSeparators || this.separators;

    // 1. Attempt to find the highest priority delimiter.
    let separator = separators[separators.length - 1]; // Default to last (usually empty string or space)
    let nextSeparators: string[] = [];

    for (let i = 0; i < separators.length; i++) {
      const sep = separators[i];
      if (sep === "" || text.includes(sep)) {
        separator = sep;
        nextSeparators = separators.slice(i + 1);
        break;
      }
    }

    // 2. Perform initial splitting based on the found delimiters.
    const splits = separator !== "" ? text.split(separator) : text.split("");

    // 3. Accumulate parts into chunks
    let currentDoc: string[] = [];
    let currentDocText = ""; // Maintain text for token counting efficiency if possible, or just join

    for (const split of splits) {
      // Check if the split itself is too large (only if we have more separators to try)
      // If we are at the character level (separator === ""), we can't recurse further.
      const splitTokenCount =
        separator !== "" && nextSeparators.length > 0
          ? this.getTokenCount(split)
          : 0; // Optimization: don't count if we aren't going to check recursion here yet, defer to accumulation check

      if (
        separator !== "" &&
        nextSeparators.length > 0 &&
        splitTokenCount > this.chunkSize
      ) {
        // The current split is too big, so we need to:
        // 1. Flush currentDoc if not empty
        if (currentDoc.length > 0) {
          finalChunks.push(currentDoc.join(separator));
          currentDoc = [];
          currentDocText = "";
        }
        // 2. Recursively split this big part
        const subChunks = this.splitText(split, nextSeparators);
        finalChunks.push(...subChunks);
        continue;
      }

      // Try adding to currentDoc
      const nextDoc =
        currentDoc.length > 0 ? currentDocText + separator + split : split;

      const nextDocTokenCount = this.getTokenCount(nextDoc);

      if (nextDocTokenCount > this.chunkSize) {
        // If adding this split exceeds chunk size, flush the *previous* state
        if (currentDoc.length > 0) {
          const doc = currentDoc.join(separator);
          finalChunks.push(doc);

          // Handle Overlap
          // We need to keep trailing elements from currentDoc that fit within chunkOverlap
          while (currentDoc.length > 0) {
            const currentStr = currentDoc.join(separator);
            if (this.getTokenCount(currentStr) <= this.chunkOverlap) {
              break;
            }
            currentDoc.shift();
          }
          // Now currentDoc contains only the overlap part.
          // Rebuild currentDocText
          currentDocText = currentDoc.join(separator);
        }

        // Now add the new split to the (now overlapped) currentDoc
        currentDoc.push(split);
        currentDocText =
          currentDoc.length > 1 ? currentDocText + separator + split : split;
      } else {
        currentDoc.push(split);
        currentDocText = nextDoc;
      }
    }

    // Process the remaining part
    if (currentDoc.length > 0) {
      finalChunks.push(currentDoc.join(separator));
    }

    return finalChunks;
  }
}
