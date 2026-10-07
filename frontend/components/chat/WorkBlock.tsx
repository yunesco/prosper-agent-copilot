'use client';

import { useEffect, useId, useState, type ComponentType } from 'react';
import { Check, ChevronRight, CircleAlert, LoaderCircle, Wrench } from 'lucide-react';
import { focusRing } from '@/components/ui/focus';

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
export type ChatActivity = {
  id: string;
  label: string;
  status: 'pending' | 'completed' | 'failed' | 'interrupted';
  /** Shown only when a step failed: the reason is the point of looking. */
  detail: string;
  /** One line saying what the step found, shown under a completed step. */
  result?: string;
  icon?: Icon;
};
/** Everything one assistant turn did, in one place: the live phase, the steps, and how long it took. */
export type ChatWork = { steps: ChatActivity[]; running: boolean; label?: string; seconds?: number };

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const duration = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

/** Mounted only while the turn runs, so it starts at zero each time work begins. */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span role="timer" className="tabular-nums">
      {clock(seconds)}
    </span>
  );
}

function StepMark({ status }: { status: ChatActivity['status'] }) {
  if (status === 'pending')
    return <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />;
  if (status === 'failed') return <CircleAlert aria-hidden="true" className="size-3.5 text-error-text" />;
  if (status === 'completed') return <Check aria-label="Completed" className="size-3.5" />;
  return null;
}

/**
 * The one place a turn's progress lives. Open while it runs (what is happening, step by step), collapsed
 * to "Worked for 42s" once it is done, and open again on its own when a step failed.
 */
export function WorkBlock({ work }: { work: ChatWork }) {
  const id = useId();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const failed = work.steps.some(step => step.status === 'failed');
  const open = chosen ?? (work.running || failed);
  const title = work.running
    ? (work.label ?? 'Thinking…')
    : work.seconds !== undefined
      ? `Worked for ${duration(work.seconds)}`
      : work.steps.some(step => step.status === 'interrupted')
        ? 'Interrupted'
        : 'Worked';
  const heading = (
    <>
      {work.running && (
        <LoaderCircle
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
      )}
      <span className={`min-w-0 truncate ${work.running ? 'text-foreground' : ''}`}>{title}</span>
      {work.running && <Elapsed />}
    </>
  );
  if (!work.steps.length)
    return <div className="flex min-h-8 items-center gap-2 text-sm text-text-muted">{heading}</div>;
  return (
    <div className="text-sm text-text-muted">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setChosen(!open)}
        className={`-ml-1.5 flex min-h-8 max-w-full items-center gap-2 rounded-md px-1.5 transition-colors hover:text-foreground ${focusRing}`}
      >
        {heading}
        <ChevronRight
          aria-hidden="true"
          className={`size-4 shrink-0 transition-transform duration-150 ease-out motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
      </button>
      <ol id={id} hidden={!open} className="ml-1.5 mt-1 space-y-1 border-l border-ui-border pl-4">
        {work.steps.map(step => {
          const Icon = step.icon ?? Wrench;
          return (
            <li key={step.id} className="[overflow-wrap:anywhere]">
              <div className="flex min-h-7 items-center gap-2">
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">{step.label}</span>
                {step.status === 'failed' && <span className="text-xs text-error-text">Failed</span>}
                {step.status === 'interrupted' && <span className="text-xs">Interrupted</span>}
                <StepMark status={step.status} />
              </div>
              {step.status === 'failed' && (
                <p className="py-1 pl-6 text-xs leading-5 text-error-text">{step.detail}</p>
              )}
              {step.status === 'completed' && step.result && (
                <p className="pb-1 pl-6 text-xs leading-5">{step.result}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
