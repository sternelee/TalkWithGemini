export interface StoppableMediaTrack {
  stop: () => void;
}

export interface StoppableMediaStream {
  getTracks: () => StoppableMediaTrack[];
}

export function stopMediaStreamTracks(
  stream?: StoppableMediaStream | null,
): number {
  if (!stream) return 0;

  let stopped = 0;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
      stopped += 1;
    } catch {
      // Keep releasing the rest of the stream even if one track misbehaves.
    }
  }
  return stopped;
}
