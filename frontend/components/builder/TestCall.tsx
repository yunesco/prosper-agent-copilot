'use client';

import { Phone, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { useTestCall } from './use-test-call';

type Call = ReturnType<typeof useTestCall>;
export function TestCallControls({ call }: { call: Call }) {
  const labels = { idle: 'Ready to call', connecting: 'Connecting…', connected: 'Call connected', ended: 'Call ended', error: 'Call could not continue' };
  return <div className="flex min-h-full flex-col items-center justify-center gap-5 px-6 py-12 text-center">
    <div className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent-text"><Phone className="size-7" aria-hidden="true" /></div>
    <h2 className="text-xl font-semibold">Test your agent</h2>
    <p className="max-w-sm text-sm leading-6 text-text-muted">Calls use the saved graph at the moment you start. Save any instruction changes in Builder before calling again.</p>
    <p role="status" className="text-sm font-medium">{labels[call.status]}</p>
    {call.error && <p role="alert" className="max-w-sm text-sm text-destructive">{call.error}</p>}
    {call.active
      ? <Button variant="destructive" onClick={call.stop}><PhoneOff aria-hidden="true" />{call.status === 'connecting' ? 'Cancel call' : 'End call'}</Button>
      : <Button onClick={call.start}><Phone aria-hidden="true" />Start call</Button>}
    <p className="max-w-sm text-xs leading-5 text-text-subtle">Use synthetic patient details. Returning to Builder ends the call.</p>
  </div>;
}

export function CallTranscript({ call }: { call: Call }) {
  return <div className="space-y-5 p-5" role="log" aria-label="Call transcript" aria-live="polite">
    <p className="text-xs leading-5 text-text-subtle">Live transcript · may differ from audio. Kept until the next call or page refresh.</p>
    {call.transcript.length === 0 && <p className="text-sm text-text-muted">Your conversation will appear here when the call starts.</p>}
    {call.transcript.map((line, index) => <div key={index} className="space-y-1">
      <p className="text-xs font-semibold text-text-muted">{line.role === 'user' ? 'You' : 'Agent'}</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{line.text}</p>
    </div>)}
  </div>;
}
