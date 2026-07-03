"use client";
import React, { useState, useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";
import { useTranslations } from "next-intl";

interface AudioPlayerProps {
  src: string; // Base64 data URI or URL
  fileName?: string;
}

const AudioPlayerInner: React.FC<AudioPlayerProps> = ({ src, fileName }) => {
  const t = useTranslations("AudioPlayer");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      setProgress(
        Number.isFinite(audio.duration) && audio.duration > 0
          ? (audio.currentTime / audio.duration) * 100
          : 0,
      );
    };

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      setHasInteracted(false); // Reset interaction state on end
    };

    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
    };
  }, [src]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    setPlaybackError(null);
    if (isPlaying) {
      audio.pause();
      return;
    }

    setHasInteracted(true);
    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
      setPlaybackError(t("playbackFailed"));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (audioRef.current) {
      setHasInteracted(true);
      const time = (val / 100) * duration;
      audioRef.current.currentTime = time;
      setProgress(val);
      setCurrentTime(time);
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || !Number.isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Logic: Show Duration by default. If playing or user manually moved slider (hasInteracted), show Current Time.
  const timeDisplay =
    isPlaying || hasInteracted ? formatTime(currentTime) : formatTime(duration);

  return (
    <div
      className="w-full max-w-70"
      role="group"
      aria-label={
        fileName
          ? t("audioAttachmentNamed", { fileName })
          : t("audioAttachment")
      }
    >
      {/* Filename Outside */}
      {fileName && (
        <div className="text-[10px] font-medium text-gray-500 dark:text-muted-foreground mb-1.5 ml-1 truncate opacity-80">
          {fileName}
        </div>
      )}

      {/* Player Container - Standard Border, No Shadow on Hover */}
      <div className="glass-surface flex items-center gap-3 p-1.5 pr-3 rounded-[20px] border transition-colors">
        <audio ref={audioRef} src={src} preload="metadata" />

        {/* Play Button */}
        <button
          type="button"
          aria-label={isPlaying ? t("pause") : t("play")}
          onClick={togglePlay}
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-linear-to-br from-gray-800 to-black from-brand to-brand/80 text-brand-foreground transition-transform active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background"
        >
          {isPlaying ? (
            <Pause size={12} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play
              size={12}
              fill="currentColor"
              className="ml-0.5"
              aria-hidden="true"
            />
          )}
        </button>

        <div className="flex-1 flex items-center gap-1 min-w-0">
          {/* Progress Bar */}
          <div className="relative flex-1 h-1.5 group cursor-pointer">
            <input
              type="range"
              name="audio-progress"
              aria-label={fileName ? t("seekNamed", { fileName }) : t("seek")}
              min="0"
              max="100"
              value={progress || 0}
              onChange={handleSeek}
              className="absolute z-10 w-full h-full opacity-0 cursor-pointer focus-visible:opacity-100 focus-visible:h-2 focus-visible:-top-0.5"
            />
            <div className="w-full h-full bg-gray-300/50 dark:bg-accent/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-[width] duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Time Display */}
          <span className="text-[10px] font-mono font-medium text-gray-500 dark:text-muted-foreground w-8 text-right tabular-nums tracking-tight">
            {timeDisplay}
          </span>
        </div>
      </div>
      {playbackError ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-1 ml-1 text-[10px] font-medium text-red-600 dark:text-red-300"
        >
          {playbackError}
        </div>
      ) : null}
    </div>
  );
};

const AudioPlayer: React.FC<AudioPlayerProps> = (props) => (
  <AudioPlayerInner key={props.src} {...props} />
);

export default AudioPlayer;
