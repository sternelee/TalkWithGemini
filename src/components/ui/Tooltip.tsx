"use client";
import React, { useId, useMemo, useState } from "react";

interface TooltipProps {
  content: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  trigger?: "hover" | "click";
  position?: "top" | "bottom" | "left" | "right";
}

const Tooltip: React.FC<TooltipProps> = ({
  content,
  className = "",
  children,
  trigger = "hover",
  position = "top",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useId();

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

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

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onClick={() => {
        if (trigger === "click") {
          setIsVisible(true);
        }
      }}
      onMouseEnter={() => {
        if (trigger === "hover") setIsVisible(true);
      }}
      onMouseLeave={() => {
        if (trigger === "hover") setIsVisible(false);
      }}
      onFocusCapture={() => setIsVisible(true)}
      onBlurCapture={() => setIsVisible(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setIsVisible(false);
        }
      }}
    >
      {describedChildren}
      <div
        id={tooltipId}
        role="tooltip"
        className={`glass-popover absolute z-101 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-foreground border rounded-lg whitespace-nowrap pointer-events-none transition-[opacity,transform] duration-150 motion-reduce:transition-none ${
          isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        } ${positionClasses[position]}`}
      >
        {content}
      </div>
    </div>
  );
};

export default Tooltip;
