"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type TooltipSide = "top" | "bottom" | "bottom-right";

type TooltipProps = {
  content: string;
  children: ReactNode;
  side?: TooltipSide;
  className?: string;
};

const TOOLTIP_GAP = 8;
const VIEWPORT_PAD = 8;
const MAX_WIDTH_PX = 288;

function computePosition(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  side: TooltipSide,
): { top: number; left: number } {
  let top: number;
  let left: number;

  switch (side) {
    case "top":
      top = triggerRect.top - tooltipRect.height - TOOLTIP_GAP;
      left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      break;
    case "bottom":
      top = triggerRect.bottom + TOOLTIP_GAP;
      left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      break;
    case "bottom-right":
    default:
      top = triggerRect.bottom + TOOLTIP_GAP;
      left = triggerRect.left;
      if (left + tooltipRect.width > window.innerWidth - VIEWPORT_PAD) {
        left = triggerRect.right - tooltipRect.width;
      }
      break;
  }

  const maxLeft = window.innerWidth - tooltipRect.width - VIEWPORT_PAD;
  const maxTop = window.innerHeight - tooltipRect.height - VIEWPORT_PAD;
  left = Math.max(VIEWPORT_PAD, Math.min(left, maxLeft));

  if (side !== "top" && top + tooltipRect.height > window.innerHeight - VIEWPORT_PAD) {
    const aboveTop = triggerRect.top - tooltipRect.height - TOOLTIP_GAP;
    if (aboveTop >= VIEWPORT_PAD) {
      top = aboveTop;
    }
  }

  top = Math.max(VIEWPORT_PAD, Math.min(top, maxTop));

  return { top, left };
}

function TooltipBubble({
  open,
  anchorRef,
  side,
  content,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLSpanElement | null>;
  side: TooltipSide;
  content: string;
}) {
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: 0,
    left: 0,
    maxWidth: MAX_WIDTH_PX,
    visibility: "hidden",
  });

  const align = side === "bottom-right" ? "text-left" : "text-center";

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;

    const { top, left } = computePosition(
      anchor.getBoundingClientRect(),
      tooltip.getBoundingClientRect(),
      side,
    );

    setStyle({
      position: "fixed",
      top,
      left,
      maxWidth: MAX_WIDTH_PX,
      visibility: "visible",
    });
  }, [anchorRef, side]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, content, side, reposition]);

  useEffect(() => {
    if (!open) return;

    function onViewportChange() {
      reposition();
    }

    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open, reposition]);

  if (!open) return null;

  return createPortal(
    <span
      ref={tooltipRef}
      role="tooltip"
      style={style}
      className={`pointer-events-none z-[9999] w-max rounded-lg bg-chef-text px-3 py-2 text-sm font-medium leading-snug text-white shadow-lg ${align}`}
    >
      {content}
    </span>,
    document.body,
  );
}

export function Tooltip({
  content,
  children,
  side = "bottom-right",
  className = "",
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    function close() {
      setOpen(false);
    }

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      close();
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!content) return <>{children}</>;

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex max-w-full ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
      onClick={() => setOpen(false)}
    >
      {children}
      {mounted ? (
        <TooltipBubble open={open} anchorRef={rootRef} side={side} content={content} />
      ) : null}
    </span>
  );
}
