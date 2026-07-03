# Media Components

Media components render interactive previews for generated, attached, or locally stored media.

## Files

- `ImagePreview.tsx` renders image preview, zooming, navigation, loading state, and error handling.

## Guidelines

- Use object URL lifecycle helpers when rendering local binary data.
- Keep preview controls stable across generated images and uploaded images.
- Preserve accessible loading and error states.
