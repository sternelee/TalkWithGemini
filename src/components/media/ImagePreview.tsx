"use client";
import React, { useEffect, useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import { useUIStore, PreviewImage } from "@/store/core/uiStore";
import { resolveOPFSUrl, isOPFSUrl } from "@/utils/opfs";
import { resolveObjectUrlWithLifecycle } from "@/lib/utils/objectUrlLifecycle";
import {
  trapModalFocus,
  useModalLifecycle,
} from "@/components/ui/useModalLifecycle";

const ResolvedImage = ({
  image,
  isVisible,
}: {
  image: PreviewImage;
  isVisible: boolean;
}) => {
  const t = useTranslations("Media");
  const [src, setSrc] = useState(() => (isOPFSUrl(image.url) ? "" : image.url));
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    if (!isOPFSUrl(image.url)) return;

    const resolution = resolveObjectUrlWithLifecycle({
      source: image.url,
      resolveObjectUrl: resolveOPFSUrl,
      onResolved: (url) => {
        setSrc(url || "");
        setHasLoadError(!url);
      },
      onError: () => {
        setSrc("");
        setHasLoadError(true);
      },
    });

    return () => resolution.cancel();
  }, [image.url]);

  if (!src) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center text-sm text-white/75 transition-[opacity,transform] duration-300 ease-out ${isVisible ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}
        role={hasLoadError ? "alert" : "status"}
        aria-live="polite"
      >
        {hasLoadError ? t("imageUnavailable") : t("loadingImage")}
      </div>
    );
  }

  return (
    <img
      key={src}
      src={src}
      alt={image.alt || t("previewAlt")}
      width={1024}
      height={768}
      onError={() => {
        setHasLoadError(true);
        setSrc("");
      }}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      className={`max-w-full max-h-full object-contain drop-shadow-2xl transition-[opacity,transform] duration-300 ease-out ${isVisible ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}
    />
  );
};

const ImagePreview = () => {
  const t = useTranslations("Media");
  const { imagePreview, closeImagePreview, setImagePreviewIndex } =
    useUIStore();
  const { isOpen, images, currentIndex } = imagePreview;

  // Local state for animation lifecycle
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const frameIds: number[] = [];
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFrame = (callback: FrameRequestCallback) => {
      const frameId = requestAnimationFrame(callback);
      frameIds.push(frameId);
    };

    if (isOpen) {
      // Use requestAnimationFrame to defer state updates
      scheduleFrame(() => {
        setShouldRender(true);
        // Double requestAnimationFrame to ensure browser paints initial state (opacity-0) before transitioning to opacity-100
        scheduleFrame(() => {
          scheduleFrame(() => {
            setIsVisible(true);
          });
        });
      });
    } else {
      // Use requestAnimationFrame to defer state update
      scheduleFrame(() => {
        setIsVisible(false);
      });
      closeTimer = setTimeout(() => {
        setShouldRender(false);
      }, 300); // Match CSS transition duration
    }

    return () => {
      for (const frameId of frameIds) cancelAnimationFrame(frameId);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [isOpen]);

  const currentImage = images[currentIndex];

  const handleNext = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (currentIndex < images.length - 1) {
        setImagePreviewIndex(currentIndex + 1);
      } else {
        // Loop back to start
        setImagePreviewIndex(0);
      }
    },
    [currentIndex, images.length, setImagePreviewIndex],
  );

  useModalLifecycle({
    open: isOpen,
    dialogRef,
    initialFocusRef: closeButtonRef,
  });

  const handlePrev = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (currentIndex > 0) {
        setImagePreviewIndex(currentIndex - 1);
      } else {
        // Loop to end
        setImagePreviewIndex(images.length - 1);
      }
    },
    [currentIndex, images.length, setImagePreviewIndex],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeImagePreview();
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
        return;
      }

      trapModalFocus(e, dialogRef.current);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleNext, handlePrev, closeImagePreview]);

  // Don't render if closed (and animation finished) or no image
  if (!shouldRender || !currentImage) return null;

  return (
    <div
      ref={dialogRef}
      className={`fixed inset-0 z-9999 flex flex-col overscroll-contain bg-black/20 backdrop-blur-2xl transition-opacity duration-300 ease-in-out dark:bg-black/80 ${isVisible ? "opacity-100" : "opacity-0"}`}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
      onClick={closeImagePreview}
      role="dialog"
      aria-modal="true"
      aria-label={
        currentImage.description || currentImage.alt || t("imagePreview")
      }
      tabIndex={-1}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-white/40 dark:bg-black/40 border-b border-white/20 dark:border-white/10 relative z-50 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-w-0 pr-4">
          {currentImage.description ? (
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-muted-foreground font-mono">
                {currentIndex + 1} / {images.length}
              </span>
              <p className="text-sm font-medium text-gray-800 dark:text-foreground truncate">
                {currentImage.description}
              </p>
            </div>
          ) : (
            <span className="text-sm font-medium text-gray-800 dark:text-foreground font-mono">
              {t("imageCounter", {
                current: currentIndex + 1,
                total: images.length,
              })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeImagePreview}
            aria-label={t("close")}
            className="p-2 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-gray-800 dark:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4">
        {/* Previous Button */}
        {images.length > 1 && (
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/70 transition-[background-color,border-color,box-shadow] border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
            aria-label={t("previous")}
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
          >
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
        )}

        {/* Next Button */}
        {images.length > 1 && (
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/70 transition-[background-color,border-color,box-shadow] border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
            aria-label={t("next")}
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
          >
            <ChevronRight size={24} aria-hidden="true" />
          </button>
        )}

        {/* Image Zoom Container */}
        <div
          className="w-full h-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={8}
            centerOnInit={true}
            wheel={{ step: 0.2 }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 p-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white">
                  <button
                    type="button"
                    onClick={() => zoomOut()}
                    aria-label={t("zoomOut")}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
                  >
                    <ZoomOut size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => resetTransform()}
                    aria-label={t("resetZoom")}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomIn()}
                    aria-label={t("zoomIn")}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
                  >
                    <ZoomIn size={16} aria-hidden="true" />
                  </button>
                </div>

                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ResolvedImage
                    key={currentImage.url}
                    image={currentImage}
                    isVisible={isVisible}
                  />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>
      </div>
    </div>
  );
};

export default ImagePreview;
