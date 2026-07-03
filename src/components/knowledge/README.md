# Knowledge Components

Knowledge components manage local knowledge collections, document status, RAG source selection, and retrieved context display.

## Files

- `KnowledgeBase.tsx` renders collection management, file upload, parsing/indexing status, and knowledge-file actions.
- `KnowledgeSelectionModal.tsx` lets users choose knowledge sources for a conversation.
- `RAGBlock.tsx` renders retrieved RAG snippets and source metadata.

## Guidelines

- Keep file and vector helpers in `src/lib/utils` or `src/lib/knowledge`.
- Keep remote RAG calls in `src/services/api/ragService.ts`.
- Preserve status labels and error states for long-running document workflows.
- Avoid loading large file contents directly in presentational components.
