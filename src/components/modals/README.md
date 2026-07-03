# Modal Components

Modal components contain reusable dialog-style workflows that do not fit a narrower component area.

## Files

- `RemoteFileModal.tsx` lets users attach a file from a remote URL after validation.

## Guidelines

- Keep modal focus management explicit.
- Validate user-entered URLs through shared security helpers or API routes.
- Keep modal state local unless it must affect app-wide state.
