import { ARTIFACT_PROMPT_LIMITS } from "../config/limits";
import { escapePromptContextText } from "../lib/utils/promptContext";

const ARTIFACT_TRUNCATION_NOTICE =
  "\n[Artifact content truncated before generation.]";
const SYSTEM_INSTRUCTION_TRUNCATION_NOTICE =
  "\n[System instruction truncated before generation.]";

function escapeBoundedPromptSection(
  value: string,
  maxChars: number,
  truncationNotice: string,
): string {
  const escaped = escapePromptContextText(value, maxChars);
  if (!escaped.truncated) return escaped.text;

  const escapedNotice = escapePromptContextText(truncationNotice).text;
  const bodyBudget = Math.max(0, maxChars - escapedNotice.length);
  return `${escapePromptContextText(value, bodyBudget).text}${escapedNotice}`;
}

function sanitizeInstructionValue(value: string, maxChars = 120): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function createArtifactPromptContext(
  content: string,
  systemInstruction: string,
): string {
  const safeContent = escapeBoundedPromptSection(
    content,
    ARTIFACT_PROMPT_LIMITS.maxArtifactContentChars,
    ARTIFACT_TRUNCATION_NOTICE,
  );
  const safeSystemInstruction = escapeBoundedPromptSection(
    systemInstruction,
    ARTIFACT_PROMPT_LIMITS.maxSystemInstructionChars,
    SYSTEM_INSTRUCTION_TRUNCATION_NOTICE,
  );

  return `
Here is the current content of the artifact:
<artifact>
${safeContent}
</artifact>

When the following systemInstruction is not empty, you can also think further about artifacts in conjunction with systemInstruction.
<systemInstruction>
${safeSystemInstruction}
</systemInstruction>
`;
}

export function changeReadingLevel(
  content: string,
  level: string,
  systemInstruction: string = "",
) {
  let prompt = "";
  const safeLevel = sanitizeInstructionValue(level);
  if (safeLevel === "pirate") {
    prompt = `
You are tasked with re-writing the following artifact to sound like a pirate.
Ensure you do not change the meaning or story behind the artifact, simply update the tone to sound like a pirate.    
`;
  } else {
    prompt = `
You are tasked with re-writing the following artifact to be at a ${safeLevel} reading level.
Ensure you do not change the meaning or story behind the artifact, simply update the tone to be of the appropriate reading level for a ${safeLevel} audience.
`;
  }
  return `
${prompt}
Keep the language of the artifact unchanged. For example, if the original text is in Chinese, the rewritten content must also be in Chinese.

${createArtifactPromptContext(content, systemInstruction)}

Rules and guidelines:
<rules-guidelines>
- Respond with ONLY the updated artifact, and no additional text before or after.
- Do not wrap it in \`<artifact></artifact>\`, \`<systemInstruction></systemInstruction>\`, \`<rules-guidelines></rules-guidelines>\`. Ensure it's just the updated artifact.
- Do not change the language of the updated artifact. The updated artifact language is consistent with the current artifact.
</rules-guidelines>
`;
}

export function changeArtifactLength(
  content: string,
  length: string,
  systemInstruction: string = "",
) {
  const safeLength = sanitizeInstructionValue(length);
  return `
You are tasked with re-writing the following artifact to be ${safeLength}.
Ensure you do not change the meaning or story behind the artifact, simply update the artifacts length to be ${safeLength}.

${createArtifactPromptContext(content, systemInstruction)}

Rules and guidelines:
<rules-guidelines>
- Respond with ONLY the updated artifact, and no additional text before or after.
- Do not wrap it in \`<artifact></artifact>\`, \`<systemInstruction></systemInstruction>\`, \`<rules-guidelines></rules-guidelines>\`. Ensure it's just the updated artifact.
- Do not change the language of the updated artifact. The updated artifact language is consistent with the current artifact.
</rules-guidelines>
`;
}

export function changeArtifactLanguage(
  content: string,
  lang: string,
  systemInstruction: string = "",
) {
  const safeLang = sanitizeInstructionValue(lang);
  return `
You are a professional ${safeLang} translator, editor, spelling corrector and improver with rich experience.
You can understand any language, and when I talk to you in any language, you will detect the language of that language, translate it correctly, and reply with the corrected and improved version of the ${safeLang} text.

${createArtifactPromptContext(content, systemInstruction)}

Rules and guidelines:
<rules-guidelines>
- ONLY change the language and nothing else.
- Respond with ONLY the updated artifact, and no additional text before or after.
- Do not wrap it in \`<artifact></artifact>\`, \`<systemInstruction></systemInstruction>\`, \`<rules-guidelines></rules-guidelines>\`. Ensure it's just the updated artifact.
</rules-guidelines>
`;
}

export function continuation(content: string, systemInstruction: string = "") {
  return `
Your task is to continue writing the following artifact.
Maintain the following artifact writing style, including but not limited to typesetting, punctuation, etc.
Only the continued artifact needs to be returned, without including the current artifact.

${createArtifactPromptContext(content, systemInstruction)}

Rules and guidelines:
<rules-guidelines>
- Respond with ONLY the continued artifact, and no additional text before.
- Do not wrap it in \`<artifact></artifact>\`, \`<systemInstruction></systemInstruction>\`, \`<rules-guidelines></rules-guidelines>\`. Ensure it's just the updated artifact.
- Do not change the language of the continued artifact. The continued artifact language is consistent with the current artifact.
</rules-guidelines>
`;
}

export function addEmojis(content: string, systemInstruction: string = "") {
  return `
You are tasked with revising the following artifact by adding emojis to it.
Ensure you do not change the meaning or story behind the artifact, simply include emojis throughout the text where appropriate.

${createArtifactPromptContext(content, systemInstruction)}

Rules and guidelines:
<rules-guidelines>
- Respond with ONLY the updated artifact, and no additional text before or after.
- Ensure you respond with the entire updated artifact, including the emojis.
- Do not wrap it in \`<artifact></artifact>\`, \`<systemInstruction></systemInstruction>\`, \`<rules-guidelines></rules-guidelines>\`. Ensure it's just the updated artifact.
- Do not change the language of the updated artifact. The updated artifact language is consistent with the current artifact.
</rules-guidelines>
`;
}

export function optimizeSystemPrompt(content: string) {
  const safeContent = escapeBoundedPromptSection(
    content,
    ARTIFACT_PROMPT_LIMITS.maxSystemInstructionChars,
    SYSTEM_INSTRUCTION_TRUNCATION_NOTICE,
  );

  return `
You are an expert prompt engineer. Your task is to optimize the following system instruction (system prompt) for an AI assistant.
Make it more effective, clear, structured, and robust. Ensure the core persona and rules are preserved but improved.

Here is the current system instruction:
<system_instruction>
${safeContent}
</system_instruction>

Rules:
- Respond with ONLY the optimized system instruction.
- Do not include any introductory or concluding remarks.
- Maintain the original language of the instruction.
`;
}

export function polishTextContent(content: string) {
  const safeContent = escapeBoundedPromptSection(
    content,
    ARTIFACT_PROMPT_LIMITS.maxArtifactContentChars,
    ARTIFACT_TRUNCATION_NOTICE,
  );

  return `
You are an expert writing assistant. Your task is to improve the clarity, flow, and expression of the following text. You must preserve the original meaning, facts, intent, language, formatting, and code blocks.

Text to polish:
<text>
${safeContent}
</text>

Rules:
- Respond with ONLY the polished text.
- Do not add facts, claims, citations, explanations, prefixes, or suffixes.
- Keep the original language unless the user explicitly asks for translation.
- Preserve Markdown, code blocks, links, and placeholders exactly when possible.
`;
}
