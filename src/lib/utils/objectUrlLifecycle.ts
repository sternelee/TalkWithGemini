type ResolveObjectUrl = (source: string) => Promise<string | null>;
type RevokeObjectUrl = (url: string) => void;

export interface CancellableObjectUrlResolution {
  cancel: () => void;
}

export function resolveObjectUrlWithLifecycle({
  source,
  resolveObjectUrl,
  onResolved,
  onError,
  revokeObjectUrl = (url) => URL.revokeObjectURL(url),
}: {
  source: string;
  resolveObjectUrl: ResolveObjectUrl;
  onResolved: (url: string | null) => void;
  onError?: () => void;
  revokeObjectUrl?: RevokeObjectUrl;
}): CancellableObjectUrlResolution {
  let cancelled = false;
  let activeObjectUrl: string | null = null;

  void resolveObjectUrl(source)
    .then((url) => {
      if (cancelled) {
        if (url) revokeObjectUrl(url);
        return;
      }

      activeObjectUrl = url;
      onResolved(url);
    })
    .catch(() => {
      if (!cancelled) onError?.();
    });

  return {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      if (activeObjectUrl) {
        revokeObjectUrl(activeObjectUrl);
        activeObjectUrl = null;
      }
    },
  };
}

export async function withResolvedObjectUrl<T>({
  source,
  resolveObjectUrl,
  read,
  revokeObjectUrl = (url) => URL.revokeObjectURL(url),
}: {
  source: string;
  resolveObjectUrl: ResolveObjectUrl;
  read: (objectUrl: string) => Promise<T>;
  revokeObjectUrl?: RevokeObjectUrl;
}): Promise<T | null> {
  const objectUrl = await resolveObjectUrl(source);
  if (!objectUrl) return null;

  try {
    return await read(objectUrl);
  } finally {
    revokeObjectUrl(objectUrl);
  }
}
