import { API_INPUT_LIMITS } from "../../config/limits";
import { clampChatInputText } from "../utils/chatInput";

export const DIAGRAM_PROMPT_MARKER = "<diagram-rendering>";
export const DIAGRAM_ENHANCED_PROMPT_MARKER = "<diagram-visual-polish>";

const DIAGRAM_PROMPT_INSTRUCTION = `<format scope="request">
<diagram-rendering>
You may use diagram code blocks when they make an answer clearer.
Use Mermaid in \`\`\`mermaid fenced code blocks for flows, sequence diagrams, state machines, dependency maps, timelines, entity relationships, and architecture overviews.
Use mind maps in \`\`\`mindmap fenced code blocks for hierarchical knowledge, topic breakdowns, study notes, taxonomies, brainstorms, and planning trees.
Never use Mermaid to render mind maps, mindmap syntax, topic trees, or radial/tree brainstorming maps. Mindmap content must use the dedicated \`\`\`mindmap fenced code block so the app's mindmap component can render it.
Mindmap content must use plain Markdown list syntax, not Mermaid mindmap syntax. Use one root topic, then two-space indented child items. For multiple independent roots, separate root trees with a blank line.
Mindmap nodes may use frontmatter for direction/theme, task states like - [x] and - [-], > remark lines, + collapsed branches, tags, and cross-links when they clarify the structure.
Do not output Mermaid mindmap syntax, graph/flowchart syntax, or a Mermaid \`mindmap\` declaration for topic trees.
Do not use diagrams for simple answers where prose, a short list, or a table is clearer.
</diagram-rendering>
</format>`;

const DIAGRAM_ENHANCED_PROMPT_INSTRUCTION = `<format scope="request">
<diagram-visual-polish>
When using Mermaid or mindmap diagrams, optimize the source for a polished, theme-aware rendering.
For Mermaid, prefer short node labels, clear grouping, readable flow direction, and avoid dense paragraphs inside nodes.
For mindmap, prefer one clear root topic, balanced breadth, roughly 2-4 useful levels, concise labels, and optional remarks instead of dense paragraphs inside nodes.
The renderer supports light and dark themes, so do not encode theme-specific colors unless the user asks for them.
Use enhanced visual style only when it improves comprehension.
</diagram-visual-polish>
</format>`;

const DIAGRAM_REQUEST_INSTRUCTIONS = `<format_instructions data-diagram-rendering="true">
For this request, you may output Mermaid diagrams in \`\`\`mermaid blocks and mind maps in \`\`\`mindmap blocks when they clarify complex structure.
Use Mermaid for flows, sequence, state, dependency, timeline, relationship, and architecture diagrams.
Use mindmap for hierarchical Markdown list syntax: one root topic with indented child items.
Never use Mermaid for mindmap, mind map, topic tree, or brainstorming-tree content; use only \`\`\`mindmap for those. Do not output Mermaid mindmap syntax, graph, or flowchart syntax for mind maps.
</format_instructions>`;

const DIAGRAM_ENHANCED_REQUEST_INSTRUCTIONS = `<format_instructions data-diagram-visual-polish="true">
When producing diagrams, use the enhanced visual style guidance: concise labels, readable grouping, theme-aware source, and balanced mindmap depth.
</format_instructions>`;

export function buildDiagramPromptInstruction({
  enhanced = false,
}: { enhanced?: boolean } = {}): string {
  return enhanced
    ? `${DIAGRAM_PROMPT_INSTRUCTION}\n\n${DIAGRAM_ENHANCED_PROMPT_INSTRUCTION}`
    : DIAGRAM_PROMPT_INSTRUCTION;
}

export function isDiagramPromptInstructionEnabled(
  systemInstruction?: string,
): boolean {
  return Boolean(systemInstruction?.includes(DIAGRAM_PROMPT_MARKER));
}

export function isEnhancedDiagramPromptInstructionEnabled(
  systemInstruction?: string,
): boolean {
  return Boolean(systemInstruction?.includes(DIAGRAM_ENHANCED_PROMPT_MARKER));
}

export function appendDiagramRequestInstructions(
  message: string,
  systemInstruction?: string,
  maxChars: number = API_INPUT_LIMITS.maxChatTextChars,
): string {
  if (!isDiagramPromptInstructionEnabled(systemInstruction)) {
    return message;
  }
  if (message.includes('data-diagram-rendering="true"')) {
    return message;
  }

  const instructions = isEnhancedDiagramPromptInstructionEnabled(
    systemInstruction,
  )
    ? `${DIAGRAM_REQUEST_INSTRUCTIONS}\n\n${DIAGRAM_ENHANCED_REQUEST_INSTRUCTIONS}`
    : DIAGRAM_REQUEST_INSTRUCTIONS;
  const separator = "\n\n";
  const maxMessageChars = Math.max(
    0,
    maxChars - separator.length - instructions.length,
  );
  const boundedMessage = clampChatInputText(message, maxMessageChars);
  return `${boundedMessage}${separator}${instructions}`;
}
