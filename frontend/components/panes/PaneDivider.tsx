"use client";

import { useRef, type RefObject } from "react";
import {
  clampSplit,
  DEFAULT_SPLIT,
  MIN_SPLIT,
  MAX_SPLIT,
} from "./pane-split";

export function PaneDivider({
  container,
  value,
  controls,
  onResize,
  onCommit,
}: {
  container: RefObject<HTMLDivElement | null>;
  value: number;
  controls: string;
  onResize: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const drag = useRef<{ initial: number; latest: number } | null>(null);
  const cancel = () => {
    if (!drag.current) return;
    onResize(drag.current.initial);
    drag.current = null;
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="Resize panes"
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuemin={MIN_SPLIT}
      aria-valuemax={MAX_SPLIT}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} percent left pane`}
      onDoubleClick={() => onCommit(DEFAULT_SPLIT)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && drag.current) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
          return;
        }
        const step = event.shiftKey ? 10 : 2;
        const next = {
          ArrowLeft: value - step,
          ArrowRight: value + step,
          Home: MIN_SPLIT,
          End: MAX_SPLIT,
        }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        onCommit(clampSplit(next));
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { initial: value, latest: value };
      }}
      onPointerMove={(event) => {
        if (
          !drag.current ||
          !event.currentTarget.hasPointerCapture(event.pointerId)
        )
          return;
        const bounds = container.current?.getBoundingClientRect();
        if (!bounds || bounds.width <= 8) return;
        const next = clampSplit(
          ((event.clientX - bounds.left - 4) / (bounds.width - 8)) * 100,
        );
        drag.current.latest = next;
        onResize(next);
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        const next = drag.current.latest;
        drag.current = null;
        onCommit(next);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      className="group col-start-2 row-start-1 hidden cursor-col-resize touch-none items-center justify-center outline-none lg:flex"
    >
      <span className="h-12 w-0.5 rounded-full bg-ui-border group-hover:bg-text-muted group-focus-visible:bg-primary" />
    </div>
  );
}
