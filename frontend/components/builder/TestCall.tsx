'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, MessageSquare, Phone, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { focusRing } from '@/components/ui/focus';
import type { useTestCall } from './use-test-call';

type Call = ReturnType<typeof useTestCall>;
export function TestCallControls({ call }: { call: Call }) {
  const labels = { idle: 'Ready to call', connecting: 'Connecting…', connected: 'Call connected', ended: 'Call ended', error: 'Call could not continue' };
  return <div className="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-12 text-center">
    <div className="flex size-20 items-center justify-center rounded-full bg-surface text-base-content"><Phone className="size-7" aria-hidden="true" /></div>
    <div className="space-y-2">
      <h2 className="text-2xl font-semibold tracking-tight">Test your agent</h2>
      <p role="status" className="text-sm text-text-muted">{labels[call.status]}</p>
    </div>
    {call.error && <p role="alert" className="max-w-sm text-sm text-destructive">{call.error}</p>}
    {call.active
      ? <Button variant="destructive" className="h-11 rounded-full px-6 motion-reduce:transform-none motion-reduce:transition-none" onClick={call.stop}><PhoneOff aria-hidden="true" />{call.status === 'connecting' ? 'Cancel call' : 'End call'}</Button>
      : <Button className="h-11 rounded-full px-6 motion-reduce:transform-none motion-reduce:transition-none" onClick={call.start}><Phone aria-hidden="true" />Start call</Button>}
  </div>;
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

  return <div className="flex min-h-0 flex-1 flex-col">
    <div ref={scroll} role="log" aria-label="Call transcript" aria-live="polite" tabIndex={0}
      className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 ${focusRing}`}
      onScroll={event => {
        const element = event.currentTarget;
        if (!element.clientHeight) return;
        follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        setAtBottom(follow.current);
      }}>
      <div ref={content} className="space-y-5">
        {call.transcript.length === 0 && <div className="flex flex-col items-center gap-3 py-12 text-center">
          <MessageSquare className="size-6 text-text-subtle" aria-hidden="true" />
          <p className="max-w-xs text-sm leading-6 text-text-muted">Your conversation will appear here when the call starts.</p>
        </div>}
        {call.transcript.map((line, index) => <div key={index}
          className={line.role === 'user' ? 'ml-8 flex min-w-0 flex-col items-end gap-1.5' : 'mr-8 flex min-w-0 flex-col items-start gap-1.5'}>
          <p className="px-1 text-xs font-medium text-text-muted">{line.role === 'user' ? 'You' : 'Agent'}</p>
          <p dir="auto" className={`max-w-full whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 [overflow-wrap:anywhere] ${line.role === 'user' ? 'rounded-br-sm bg-primary text-primary-content' : 'rounded-bl-sm bg-surface'}`}>{line.text}</p>
        </div>)}
      </div>
    </div>
    {!atBottom && call.transcript.length > 0 && <div className="flex shrink-0 justify-center px-5 py-2">
      <Button variant="outline" className="h-11 rounded-full px-4 motion-reduce:transform-none motion-reduce:transition-none" onClick={() => {
        follow.current = true;
        setAtBottom(true);
        if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
      }}><ArrowDown aria-hidden="true" />Jump to latest</Button>
    </div>}
  </div>;
}
