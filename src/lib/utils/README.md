# Utility Modules

The `src/lib/utils` directory contains small, focused helpers used across chat, settings, media, knowledge, streaming, and UI-adjacent workflows. Utilities should be easy to test and should avoid hidden store mutations.

## Common Modules

### Attachments And Files

- `attachments.ts` converts attachments for model providers.
- `chatAttachmentFiles.ts` handles chat attachment file records.
- `workspaceFiles.ts` handles workspace file helpers.
- `knowledgeFiles.ts` and `knowledgeVectors.ts` support knowledge-base file and vector workflows.
- `markdownFiles.ts` and `filename.ts` provide file-format and naming helpers.

### Chat And History

- `history.ts` prepares provider-specific message history.
- `message.ts` updates message token metadata.
- `promptContext.ts` builds prompt context.
- `contextCompression.ts` supports compression workflows.
- `tokens.ts` calculates token attribution.
- `streamingText.ts` and `typewriter.ts` support streamed text display.

### Model And Provider Helpers

- `model.ts` checks model capabilities.
- `models.ts` builds available model lists.
- `defaultModels.ts` resolves effective task model selections.
- `schema.ts` converts schemas for provider APIs.

### RAG, Search, And Citations

- `rag.ts` processes RAG attachments and local knowledge-base content.
- `citations.ts` normalizes citation data.
- `toolDisplay.ts` formats tool names, arguments, and results for display.

### Media And Voice

- `generatedImages.ts` tracks generated image output.
- `imagePreview.ts` and `objectUrlLifecycle.ts` manage preview URLs.
- `mediaRecording.ts` supports recording flows.
- `disposableAudio.ts`, `speechPolling.ts`, and `voiceModels.ts` support speech playback and voice-provider choices.

### UI Helpers

- `chatInput.ts` handles input behavior.
- `clipboard.ts` wraps copy behavior.
- `htmlPreview.ts` prepares safe artifact previews.
- `messageMetaTooltip.ts` formats message metadata.
- `reasoningDisplay.ts` formats reasoning blocks.
- `timedStatus.ts` handles temporary status reset behavior.

### Server-Side Safety

- `safeServerLog.ts` centralizes safe server logging.
- `devLogger.ts` provides development logging helpers.

## Guidelines

- Prefer pure functions when practical.
- Keep each helper focused on one responsibility.
- Put runtime validation near the boundary that receives untrusted input.
- Avoid adding broad utility modules when a feature-specific helper would be clearer.
- Add tests for normalization, formatting, lifecycle cleanup, and security-sensitive behavior.

## Example

```typescript
import { processAttachmentsForModel } from "@/lib/utils/attachments";
import { processRAGAttachments } from "@/lib/utils/rag";

const ragResult = await processRAGAttachments(
  text,
  kbAttachments,
  ragConfig,
  supportsAttachment,
);

const attachmentResult = await processAttachmentsForModel(
  otherAttachments,
  supportsAttachment,
  resolveOPFSUrl,
);
```
