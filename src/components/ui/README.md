# UI Components

The `src/components/ui` directory contains small reusable primitives shared by feature components.

## Files

- `AnchoredPortal.tsx` renders anchored floating content through a portal.
- `dropdown-menu.tsx` wraps Radix Dropdown Menu with local menu styling.
- `Icons.tsx` contains shared icon wrappers and icon utilities.
- `SafeImage.tsx` renders images with safe loading and fallback behavior.
- `Tooltip.tsx` renders reusable tooltip behavior.
- `primitives.tsx` contains small shared UI building blocks.

## Guidelines

- Keep primitives generic and free of feature-specific store dependencies.
- Prefer existing primitives before adding new local UI patterns.
- Preserve keyboard, focus, and screen-reader behavior.
- Keep visual behavior stable across light and dark themes.
