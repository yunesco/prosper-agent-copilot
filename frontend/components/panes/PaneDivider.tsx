'use client';

import { useRef, type RefObject } from 'react';
import { clampSplit, DEFAULT_SPLIT, MIN_SPLIT } from './pane-split';

export function PaneDivider({
  container,
  value,
  controls,
  max,
  onResize,
  onCommit,
}: {
  container: RefObject<HTMLDivElement | null>;
  value: number;
  max: number;
  controls: string;
  onResize: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const drag = useRef<{ pointerId: number; initial: number; latest: number } | null>(null);
  const cancel = (element: HTMLDivElement) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    onResize(current.initial);
    if (element.hasPointerCapture(current.pointerId)) element.releasePointerCapture(current.pointerId);
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="Resize panes"
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuemin={MIN_SPLIT}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} percent left pane`}
      onDoubleClick={() => onCommit(clampSplit(DEFAULT_SPLIT, MIN_SPLIT, max))}
      onKeyDown={event => {
        if (event.key === 'Escape' && drag.current) {
          event.preventDefault();
          event.stopPropagation();
          cancel(event.currentTarget);
          return;
        }
        const step = event.shiftKey ? 10 : 2;
        const next = {
          ArrowLeft: value - step,
          ArrowRight: value + step,
          Home: MIN_SPLIT,
          End: max,
        }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        onCommit(clampSplit(next, MIN_SPLIT, max));
      }}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, initial: value, latest: value };
      }}
      onPointerMove={event => {
        if (
          !drag.current ||
          drag.current.pointerId !== event.pointerId ||
          !event.currentTarget.hasPointerCapture(event.pointerId)
        )
          return;
        const bounds = container.current?.getBoundingClientRect();
        if (!bounds || bounds.width <= 8) return;
        const next = clampSplit(
          ((event.clientX - bounds.left - 4) / (bounds.width - 8)) * 100,
          MIN_SPLIT,
          max,
        );
        drag.current.latest = next;
        onResize(next);
      }}
      onPointerUp={event => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        const next = drag.current.latest;
        drag.current = null;
        onCommit(next);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={event => {
        if (drag.current?.pointerId === event.pointerId) cancel(event.currentTarget);
      }}
      onLostPointerCapture={event => {
        if (drag.current?.pointerId === event.pointerId) cancel(event.currentTarget);
      }}
      className="group relative col-start-2 row-start-1 hidden cursor-col-resize touch-none items-center justify-center bg-surface-raised outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-ui-border md:flex"
    >
      <span className="relative h-12 w-1 rounded-full bg-transparent transition-colors group-hover:bg-text-subtle group-focus-visible:bg-accent" />
    </div>
  );
}
