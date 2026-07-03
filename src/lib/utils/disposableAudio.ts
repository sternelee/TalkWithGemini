export type DisposableAudioElement = HTMLAudioElement & {
  dispose: () => void;
};

type AudioFactory = (src: string) => HTMLAudioElement;
type ObjectUrlFactory = (blob: Blob) => string;
type ObjectUrlRevoke = (url: string) => void;

export function attachObjectUrlDisposal(
  audio: HTMLAudioElement,
  objectUrl: string,
  revokeObjectUrl: ObjectUrlRevoke = (url) => URL.revokeObjectURL(url),
): DisposableAudioElement {
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    audio.removeEventListener("ended", dispose);
    audio.removeEventListener("error", dispose);
    audio.pause();
    revokeObjectUrl(objectUrl);
  };

  audio.addEventListener("ended", dispose, { once: true });
  audio.addEventListener("error", dispose, { once: true });

  return Object.assign(audio, { dispose });
}

export function createDisposableAudioFromBlob(
  blob: Blob,
  audioFactory: AudioFactory = (src) => new Audio(src),
  createObjectUrl: ObjectUrlFactory = (value) => URL.createObjectURL(value),
  revokeObjectUrl: ObjectUrlRevoke = (url) => URL.revokeObjectURL(url),
): DisposableAudioElement {
  const objectUrl = createObjectUrl(blob);
  return attachObjectUrlDisposal(
    audioFactory(objectUrl),
    objectUrl,
    revokeObjectUrl,
  );
}
