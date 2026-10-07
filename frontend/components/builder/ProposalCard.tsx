'use client';

import { Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { focusRing } from '@/components/ui/focus';
import {
  candidateDiff,
  configurationChecks,
  type GraphReference,
  type Proposal,
} from '@/lib/agent/proposals';
import type { SavedAgent } from '@/lib/agent/repository';
import { GraphLink } from './GraphLink';

const proposalGuidance: Record<string, string> = {
  'Out of date': 'The saved agent has changed. Ask Copilot for a fresh proposal.',
  Superseded: 'A newer request has replaced this proposal.',
  Interrupted: 'This response did not finish. Retry to get a complete proposal.',
  Dismissed: 'Dismissed without changing the agent.',
  Applied: 'Saved to the agent. Test Call uses the saved changes.',
  'Validating proposal…': 'Wait for the response to finish before reviewing this proposal.',
};
const disclosureClass = `flex cursor-pointer list-none items-center gap-2 rounded py-2 font-medium ${focusRing}`;

/** A validated candidate for human review. Only an explicit Apply saves it. */
export function ProposalCard({
  proposal,
  base,
  state,
  record,
  dirty,
  applying,
  onApply,
  onDismiss,
  onFocus,
  onTest,
  onPreview,
}: {
  proposal: Proposal;
  base: SavedAgent | undefined;
  state: string;
  record: SavedAgent;
  dirty: boolean;
  applying: boolean;
  onApply: (proposal: Proposal, base: SavedAgent) => void;
  onDismiss: () => void;
  onFocus: (ref: GraphReference) => void;
  onTest: () => void;
  onPreview?: (proposal: Proposal, reference?: GraphReference) => void;
}) {
  const changes = base
    ? candidateDiff(base.agent, proposal.candidate, {
        before: base.guidelines,
        after: proposal.guidelines,
      })
    : [];
  const ready = state === 'Ready to apply';
  const historical =
    !ready &&
    state !== 'Validating proposal…' &&
    !(state === 'Applied' && proposal.baseRevision + 1 === record.revision);
  const Container = historical ? 'details' : 'section';
  const Heading = historical ? 'summary' : 'header';
  return (
    <Container
      aria-label="Proposal review"
      className="mt-6 min-w-0 space-y-4 rounded-xl border border-ui-border p-4 text-sm leading-6 [overflow-wrap:anywhere]"
    >
      <Heading className={historical ? `cursor-pointer rounded space-y-2 ${focusRing}` : 'space-y-2'}>
        <h3 className="text-base font-semibold leading-6">{proposal.outcome}</h3>
        <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
          {state === 'Applied' && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
          {state}
        </p>
      </Heading>
      {ready && onPreview && (
        <Button variant="outline" className="w-full" onClick={() => onPreview(proposal)}>
          Inspect on canvas
        </Button>
      )}
      <dl className="space-y-3">
        <div>
          <dt className="font-medium">Why</dt>
          <dd className="mt-1 text-text-muted">{proposal.explanation}</dd>
        </div>
        <div>
          <dt className="font-medium">Behavior affected</dt>
          <dd className="mt-1 text-text-muted">{proposal.behavior}</dd>
        </div>
        <div>
          <dt className="font-medium">Implementation</dt>
          <dd className="mt-1 text-text-muted">
            {base ? changes.map(change => change.label).join(', ') : 'Saved context is unavailable.'}
          </dd>
        </div>
      </dl>
      {base && (
        <details className="group border-t border-ui-border pt-1">
          <summary className={disclosureClass}>
            <ChevronRight className="size-4 shrink-0 group-open:rotate-90" aria-hidden="true" />
            View changes
          </summary>
          <div className="space-y-4 pb-2">
            {changes.map((change, index) => (
              <div key={index} className="space-y-2 border-t border-ui-border pt-3">
                <p className="font-medium">{change.label}</p>
                {change.reference && (
                  <GraphLink
                    reference={change.reference}
                    record={ready && onPreview ? { ...record, agent: proposal.candidate } : record}
                    onFocus={ref => (ready && onPreview ? onPreview(proposal, ref) : onFocus(ref))}
                  />
                )}
                <p className="text-xs text-text-muted">Before</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-surface p-3 text-xs leading-5 [overflow-wrap:anywhere]">
                  {JSON.stringify(change.before, null, 2)}
                </pre>
                <p className="text-xs text-text-muted">After</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-surface p-3 text-xs leading-5 [overflow-wrap:anywhere]">
                  {JSON.stringify(change.after, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="space-y-2 border-t border-ui-border pt-3 text-xs leading-5">
        <p>
          <span className="font-medium">Graph validation</span>
          <span className="text-text-muted"> · Passed Python validation</span>
        </p>
        {base && (
          <details className="group">
            <summary className={`${disclosureClass} py-1`}>
              <ChevronRight className="size-3.5 shrink-0 group-open:rotate-90" aria-hidden="true" />
              Configuration checks
            </summary>
            <ul className="space-y-2 py-2 text-text-muted">
              {configurationChecks(base.agent, proposal.candidate).map(check => (
                <li key={check.name}>
                  {check.name} · {check.unchanged ? 'Unchanged' : 'Changed'}
                </li>
              ))}
            </ul>
          </details>
        )}
        <p>
          <span className="font-medium">Model review</span>
          <span className="text-text-muted"> · Explanation above; not an executed test</span>
        </p>
        <p>
          <span className="font-medium">Conversation checks</span>
          <span className="text-text-muted"> · Not run</span>
        </p>
      </div>
      {(ready || proposalGuidance[state]) && (
        <footer className="space-y-3 border-t border-ui-border pt-3">
          <p className="text-xs leading-5 text-text-muted">
            {ready
              ? dirty
                ? 'Save or cancel your draft in Details before applying.'
                : 'Apply saves these changes to the agent.'
              : proposalGuidance[state]}
          </p>
          {ready && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={applying} onClick={() => onDismiss()}>
                Dismiss
              </Button>
              <Button disabled={dirty || applying || !base} onClick={() => base && onApply(proposal, base)}>
                {applying ? 'Applying…' : 'Apply'}
              </Button>
            </div>
          )}
          {state === 'Applied' && proposal.baseRevision + 1 === record.revision && (
            <Button variant="outline" onClick={onTest}>
              Test Call
            </Button>
          )}
        </footer>
      )}
    </Container>
  );
}
