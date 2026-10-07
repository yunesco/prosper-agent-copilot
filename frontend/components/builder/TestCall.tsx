'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, LoaderCircle, MessageSquare, Phone, PhoneOff, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { focusRing } from '@/components/ui/focus';
import { stepTitle } from '@/lib/agent/graph';
import type { SavedAgent } from '@/lib/agent/repository';
import type { useTestCall } from './use-test-call';

type Call = ReturnType<typeof useTestCall>;
export function TestCallControls({
  call,
  saved,
  dirty = false,
}: {
  call: Call;
  saved: SavedAgent;
  dirty?: boolean;
}) {
  const identity = call.identity ?? saved;
  const labels = {
    idle: 'Ready to call',
    connecting: 'Connecting…',
    connected: 'Call connected',
    ended: 'Call ended',
    error: 'Call could not continue',
  };
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4">
      <div className="pointer-events-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-ui-border bg-surface-raised p-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-base-content">
            {call.status === 'connecting' ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Phone className="size-4" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p role="status" className="text-sm font-medium">
              {labels[call.status]}
            </p>
            <p className="truncate text-xs text-text-muted">
              Saved agent {identity.id} · Revision {identity.revision}
              {dirty && ' · Unsaved drafts are excluded from Test Call.'}
            </p>
          </div>
        </div>
        {call.active ? (
          <Button
            variant="destructive"
            className="h-9 rounded-lg px-4 motion-reduce:transform-none motion-reduce:transition-none"
            onClick={call.stop}
          >
            <PhoneOff aria-hidden="true" />
            {call.status === 'connecting' ? 'Cancel call' : 'End call'}
          </Button>
        ) : (
          <Button
            className="h-9 rounded-lg px-4 motion-reduce:transform-none motion-reduce:transition-none"
            onClick={call.start}
          >
            <Phone aria-hidden="true" />
            Start call
          </Button>
        )}
        {call.error && (
          <p role="alert" className="w-full text-sm leading-6 text-destructive [overflow-wrap:anywhere]">
            {call.error}
          </p>
        )}
      </div>
    </div>
  );
}

export function CallTranscript({ call }: { call: Call }) {
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  // Segment text grows in place, so follow every transcript update, not just new rows.
  useLayoutEffect(() => {
    if (call.transcript.length === 0) follow.current = true;
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [call.transcript]);

  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element || !content.current) return;
    // Follow after pane resizing or revealing the mobile transcript, too.
    const observer = new ResizeObserver(() => {
      if (follow.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroll}
        role="log"
        aria-label="Call transcript"
        aria-live="polite"
        tabIndex={0}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 ${focusRing}`}
        onScroll={event => {
          const element = event.currentTarget;
          if (!element.clientHeight) return;
          follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
          setAtBottom(follow.current);
        }}
      >
        <div ref={content} className="space-y-5">
          {call.transcript.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <MessageSquare className="size-6 text-text-subtle" aria-hidden="true" />
              <p className="max-w-xs text-sm leading-6 text-text-muted">
                Your conversation will appear here when the call starts.
              </p>
            </div>
          )}
          {call.transcript.map((line, index) =>
            line.tool ? (
              <p
                key={index}
                data-testid="tool-call"
                className="mr-8 flex min-w-0 items-center gap-2 rounded-lg border border-ui-border px-3 py-2 font-mono text-xs leading-5 text-text-muted [overflow-wrap:anywhere]"
              >
                <Wrench aria-hidden="true" className="size-3.5 shrink-0" />
                {line.text}
              </p>
            ) : (
              <div
                key={index}
                className={
                  line.role === 'user'
                    ? 'ml-8 flex min-w-0 flex-col items-end gap-1.5'
                    : 'mr-8 flex min-w-0 flex-col items-start gap-1.5'
                }
              >
                <p className="px-1 text-xs font-medium text-text-muted">
                  {line.role === 'user' ? 'You' : 'Agent'}
                  {line.role === 'assistant' && line.node && (
                    <span className="ml-2 rounded-full border border-ui-border px-2 py-0.5 font-normal">
                      {stepTitle(line.node)}
                    </span>
                  )}
                </p>
                <p
                  dir="auto"
                  className={`max-w-full whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-6 [overflow-wrap:anywhere] ${line.role === 'user' ? 'bg-surface' : 'bg-background'}`}
                >
                  {line.text}
                </p>
              </div>
            ),
          )}
        </div>
      </div>
      {!atBottom && call.transcript.length > 0 && (
        <div className="flex shrink-0 justify-center px-5 py-2">
          <Button
            variant="outline"
            className="h-9 rounded-lg px-4 motion-reduce:transform-none motion-reduce:transition-none"
            onClick={() => {
              follow.current = true;
              setAtBottom(true);
              if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
            }}
          >
            <ArrowDown aria-hidden="true" />
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
}
