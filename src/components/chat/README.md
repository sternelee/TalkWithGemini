# Chat Components

Chat components render the main conversation experience: message input, message display, follow-up prompts, audio playback, attachments, and message actions.

## Files

- `MessageInput.tsx` handles text entry, file attachments, voice input, model-aware controls, and send actions.
- `MessageItem.tsx` renders a single message with editing, copying, branching, deletion, playback, and metadata controls.
- `FollowUpQuestions.tsx` renders suggested next questions after a response.
- `AudioPlayer.tsx` renders audio playback controls for generated or attached audio.

## Guidelines

- Keep chat-domain transformations in `src/lib/chat` or `src/lib/utils`.
- Keep API workflows in `src/services/api/chatService.ts`.
- Preserve accessibility for interactive message actions.
- Avoid broad store subscriptions; select only the fields each component needs.
