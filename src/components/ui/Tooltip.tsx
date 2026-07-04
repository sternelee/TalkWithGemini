"use client";
import React, {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  trigger?: "hover" | "click";
  position?: "top" | "bottom" | "left" | "right";
  autoDismissMs?: number;
  portal?: boolean;
}

const DEFAULT_AUTO_DISMISS_MS = 1800;
const PORTAL_OFFSET = 8;
const PORTAL_MARGIN = 8;
const HIDDEN_PORTAL_STYLE: CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  visibility: "hidden",
  pointerEvents: "none",
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const Tooltip: React.FC<TooltipProps> = ({
  content,
  className = "",
  children,
  trigger = "hover",
  position = "top",
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  portal = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [portalStyle, setPortalStyle] =
    useState<CSSProperties>(HIDDEN_PORTAL_STYLE);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const dismissedUntilNextTriggerRef = useRef(false);
  const tooltipId = useId();

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const updatePortalPosition = useCallback(() => {
    const wrapper = wrapperRef.current;
    const tooltip = tooltipRef.current;
    if (!wrapper || !tooltip || typeof window === "undefined") return;

    const anchorRect = wrapper.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    if (tooltipWidth <= 0 || tooltipHeight <= 0) return;

    let left = anchorRect.left + (anchorRect.width - tooltipWidth) / 2;
    let top = anchorRect.top - tooltipHeight - PORTAL_OFFSET;

    if (position === "bottom") {
      top = anchorRect.bottom + PORTAL_OFFSET;
    } else if (position === "left") {
      left = anchorRect.left - tooltipWidth - PORTAL_OFFSET;
      top = anchorRect.top + (anchorRect.height - tooltipHeight) / 2;
    } else if (position === "right") {
      left = anchorRect.right + PORTAL_OFFSET;
      top = anchorRect.top + (anchorRect.height - tooltipHeight) / 2;
    }

    left = clamp(
      left,
      PORTAL_MARGIN,
      Math.max(PORTAL_MARGIN, window.innerWidth - tooltipWidth - PORTAL_MARGIN),
    );
    top = clamp(
      top,
      PORTAL_MARGIN,
      Math.max(
        PORTAL_MARGIN,
        window.innerHeight - tooltipHeight - PORTAL_MARGIN,
      ),
    );

    setPortalStyle({
      position: "fixed",
      left: Math.round(left),
      top: Math.round(top),
      visibility: "visible",
      pointerEvents: "none",
    });
  }, [position]);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const startDismissTimer = useCallback(() => {
    clearDismissTimer();
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      dismissedUntilNextTriggerRef.current = true;
      setIsVisible(false);
    }, autoDismissMs);
  }, [autoDismissMs, clearDismissTimer]);

  const showTooltip = useCallback(() => {
    if (dismissedUntilNextTriggerRef.current) return;
    setIsVisible(true);
    startDismissTimer();
  }, [startDismissTimer]);

  const hideTooltip = useCallback(
    (lockUntilNextTrigger = false) => {
      clearDismissTimer();
      dismissedUntilNextTriggerRef.current = lockUntilNextTrigger;
      setIsVisible(false);
    },
    [clearDismissTimer],
  );

  const resetTriggerCycle = useCallback(() => {
    dismissedUntilNextTriggerRef.current = false;
    hideTooltip(false);
  }, [hideTooltip]);

  useEffect(() => clearDismissTimer, [clearDismissTimer]);

  useEffect(() => {
    if (!portal) return;
    if (!isVisible) return;

    let frameId = window.requestAnimationFrame(updatePortalPosition);
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updatePortalPosition);
    };

    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [isVisible, portal, updatePortalPosition]);

  const describedChildren = useMemo(() => {
    const childArray = React.Children.toArray(children);
    if (childArray.length !== 1 || !React.isValidElement(childArray[0])) {
      return children;
    }

    const child = childArray[0] as React.ReactElement<Record<string, unknown>>;
    const existingDescribedBy = child.props["aria-describedby"];
    const describedBy =
      typeof existingDescribedBy === "string" && existingDescribedBy.trim()
        ? `${existingDescribedBy} ${tooltipId}`
        : tooltipId;

    return React.cloneElement(child, {
      "aria-describedby": describedBy,
    });
  }, [children, tooltipId]);

  const tooltipClassName = `glass-popover ${
    portal ? "fixed z-9999" : "absolute z-101"
  } px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-foreground border rounded-lg whitespace-nowrap pointer-events-none transition-[opacity,transform] duration-150 motion-reduce:transition-none ${
    isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
  } ${portal ? "" : positionClasses[position]}`;

  const tooltipNode = (
    <div
      ref={tooltipRef}
      id={tooltipId}
      role="tooltip"
      style={
        portal ? (isVisible ? portalStyle : HIDDEN_PORTAL_STYLE) : undefined
      }
      className={tooltipClassName}
    >
      {content}
    </div>
  );

  const canUsePortal = portal && typeof document !== "undefined";

  return (
    <div
      ref={wrapperRef}
      className={`relative inline-flex items-center ${className}`}
      onClick={() => {
        if (trigger === "click") {
          dismissedUntilNextTriggerRef.current = false;
          showTooltip();
        }
      }}
      onMouseEnter={() => {
        if (trigger === "hover") showTooltip();
      }}
      onMouseLeave={() => {
        if (trigger === "hover") resetTriggerCycle();
      }}
      onFocusCapture={showTooltip}
      onBlurCapture={resetTriggerCycle}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          hideTooltip(true);
        }
      }}
    >
      {describedChildren}
      {canUsePortal ? createPortal(tooltipNode, document.body) : tooltipNode}
    </div>
  );
};

export default Tooltip;
