'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, CircleAlert, Phone, Sparkles } from 'lucide-react';
import type { CallSummary, ProductionCall } from '@/lib/platform/schema';
import { fetchCall, fetchCalls } from '@/lib/runtime/platform';
import type { SavedAgent } from '@/lib/agent/repository';
import type { GraphReference } from '@/lib/agent/proposals';
import { Button } from '@/components/ui/Button';
import { GraphLink } from './GraphLink';

type Listing = { agentId: string; calls: CallSummary[] } | { agentId: string; error: string };

export function RecentCalls({
  record,
  onOpen,
  onReview,
  busy = false,
}: {
  record: SavedAgent;
  onOpen: (call: ProductionCall) => void;
  onReview?: () => void;
  busy?: boolean;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetchCalls(record.id, { signal: controller.signal })
      .then(calls => setListing({ agentId: record.id, calls }))
      .catch(error => {
        if (!controller.signal.aborted)
          setListing({
            agentId: record.id,
            error: error instanceof Error ? error.message : 'Could not load call data.',
          });
      });
    return () => controller.abort();
  }, [record.id]);
  const current = listing?.agentId === record.id ? listing : null;
  const open = async (id: string) => {
    setOpening(id);
    setOpenError('');
    try {
      onOpen(await fetchCall(record.id, id));
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : 'Could not load the call.');
    } finally {
      setOpening(null);
    }
  };
  return (
    <section aria-label="Recent calls" className="min-w-0 space-y-3 border-t border-ui-border pt-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Recent calls</h3>
        <span className="text-xs text-text-muted">Mock platform data</span>
      </div>
      {!current ? (
        <p role="status" className="py-2 text-sm leading-6 text-text-muted">
          Loading calls…
        </p>
      ) : 'error' in current ? (
        <p role="alert" className="py-2 text-sm leading-6 text-error-text">
          {current.error}
        </p>
      ) : current.calls.length ? (
        <div className="divide-y divide-ui-border">
          {current.calls.map(call => {
            const failed = call.outcome === 'failed';
            const Icon = failed ? CircleAlert : Phone;
            return (
              <Button
                key={call.id}
                type="button"
                variant="ghost"
                disabled={opening !== null}
                className="h-auto w-full justify-start gap-3 whitespace-normal rounded-lg px-2 py-3.5 text-left"
                onClick={() => void open(call.id)}
              >
                <span
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center self-start rounded-lg ${failed ? 'bg-error-soft text-error-text' : 'bg-surface text-text-muted'}`}
                >
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="block text-sm leading-5">{call.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-normal leading-5 text-text-muted">
                    <span className={failed ? 'font-medium text-error-text' : ''}>
                      {failed ? 'Failed' : 'Successful'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{call.turns} turns</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDuration(call.duration_seconds)}</span>
                    {call.reported && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Client reported</span>
                      </>
                    )}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 text-text-muted" />
              </Button>
            );
          })}
        </div>
      ) : (
        <p className="py-2 text-sm leading-6 text-text-muted">No recent calls for this agent.</p>
      )}
      {openError && (
        <p role="alert" className="text-sm text-error-text">
          {openError}
        </p>
      )}
      {onReview && current && 'calls' in current && current.calls.length > 0 && (
        <Button type="button" variant="outline" className="w-full gap-2" disabled={busy} onClick={onReview}>
          <Sparkles aria-hidden="true" className="size-4" />
          Review recent calls with Copilot
        </Button>
      )}
    </section>
  );
}

const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function CallDetails({
  call,
  record,
  onBack,
  onFocus,
  onInvestigate,
  highlightTurn = null,
  busy = false,
}: {
  call: ProductionCall;
  record: SavedAgent;
  onBack: () => void;
  onFocus: (ref: GraphReference) => void;
  onInvestigate?: () => void;
  highlightTurn?: number | null;
  busy?: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const cited = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (call.agent_id !== record.id) return;
    backButton.current?.focus({ preventScroll: true });
    section.current?.scrollIntoView({ block: 'start' });
    // A citation lands on its own turn; otherwise the call opens at the top.
    if (highlightTurn) cited.current?.scrollIntoView({ block: 'center' });
  }, [call.id, call.agent_id, record.id, highlightTurn]);
  if (call.agent_id !== record.id) return null;
  const failed = call.outcome === 'failed';
  const OutcomeIcon = failed ? CircleAlert : Check;
  return (
    <section ref={section} aria-label="Call details" className="min-w-0 text-sm [overflow-wrap:anywhere]">
      <div className="px-5 pt-4">
        <Button
          ref={backButton}
          variant="ghost"
          size="sm"
          className="-ml-2 min-h-9 text-text-muted"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
          Back to agent details
        </Button>
      </div>
      <header className="space-y-3 px-5 pb-5 pt-3">
        <h3 className="text-xl font-semibold leading-7 tracking-tight">{call.title}</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium ${failed ? 'bg-error-soft text-error-text' : 'bg-surface text-base-content'}`}
          >
            <OutcomeIcon aria-hidden="true" className="size-3.5" />
            <span className="sr-only">Outcome: </span>
            {failed ? 'Failed' : 'Successful'}
          </span>
          <span className="text-text-muted">Mock platform data</span>
        </div>
        {onInvestigate && (
          <Button type="button" className="w-full gap-2 sm:w-auto" disabled={busy} onClick={onInvestigate}>
            <Sparkles aria-hidden="true" className="size-4" />
            Investigate with Copilot
          </Button>
        )}
      </header>
      <div className="mx-5 space-y-5 border-b border-ui-border pb-5">
        {call.client_feedback ? (
          <div className="space-y-2 rounded-xl bg-surface p-4">
            <h4 className="font-medium">Client feedback</h4>
            <blockquote className="leading-6">{call.client_feedback}</blockquote>
          </div>
        ) : (
          <p className="text-xs leading-5 text-text-muted">Client feedback: None reported.</p>
        )}
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-text-muted">Recorded graph path</h4>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {call.graph_path.map((node, index) => (
              <span key={index} className="inline-flex min-w-0 max-w-full items-center gap-2">
                {index > 0 && (
                  <ChevronRight aria-hidden="true" className="size-3 shrink-0 text-text-subtle" />
                )}
                <GraphLink record={record} reference={{ kind: 'node', node }} onFocus={onFocus} />
              </span>
            ))}
          </div>
          <p className="text-xs leading-5 text-text-muted">
            Open a step in the current graph. This transcript stays unchanged after edits.
          </p>
        </div>
      </div>
      <div className="px-5 py-5">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h4 className="font-semibold">Transcript</h4>
          <span className="text-xs tabular-nums text-text-muted">{call.transcript.length} turns</span>
        </div>
        <ol aria-label="Transcript turns" className="space-y-4">
          {call.transcript.map((turn, index) => (
            <li
              key={index}
              ref={highlightTurn === index + 1 ? cited : undefined}
              aria-current={highlightTurn === index + 1 ? 'true' : undefined}
              className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2 rounded-xl aria-[current=true]:bg-accent-soft aria-[current=true]:ring-2 aria-[current=true]:ring-accent"
            >
              <span aria-label={`Turn ${index + 1}`} className="pt-3 text-xs tabular-nums text-text-subtle">
                {index + 1}
              </span>
              <div className={`min-w-0 rounded-xl px-3 py-2.5 ${turn.role === 'user' ? 'bg-surface' : ''}`}>
                <span className="text-xs font-semibold text-text-muted">
                  {turn.role === 'user' ? 'Caller' : 'Agent'}
                </span>
                <p dir="auto" className="mt-1 whitespace-pre-wrap leading-6">
                  {turn.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 border-t border-ui-border pt-4 text-xs leading-5 text-text-muted">
          Call ID: {call.id}
        </p>
      </div>
    </section>
  );
}
