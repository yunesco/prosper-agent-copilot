'use client';

import { useId, useState } from 'react';
import { Bot, Check, ChevronRight, FileText, MessageSquare, Scan, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { focusRing } from '@/components/ui/focus';
import { referenceExists, type GraphReference, type Proposal } from '@/lib/agent/proposals';
import { proposalReviewRows, proposalReviewTexts, type ProposalReviewRow } from '@/lib/agent/proposal-review';
import type { SavedAgent } from '@/lib/agent/repository';
import { DiffText } from './DiffText';

const proposalGuidance: Record<string, string> = {
  'Out of date': 'The saved agent has changed. Ask Copilot for a fresh proposal.',
  Superseded: 'A newer request has replaced this proposal.',
  Interrupted: 'This response did not finish. Retry to get a complete proposal.',
  Dismissed: 'Dismissed without changing the agent.',
  Applied: 'Saved to the agent. Test Call uses the saved changes.',
  'Validating proposal…': 'Wait for the response to finish before reviewing this proposal.',
};
const disclosureClass = `flex cursor-pointer list-none items-center gap-2 rounded py-2 font-medium ${focusRing}`;

const rowIcons = { instructions: Bot, guidelines: FileText, settings: Settings2, step: MessageSquare };

function ChangeRow({ row, onInspect }: { row: ProposalReviewRow; onInspect?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const Icon = rowIcons[row.kind];
  return (
    <li className="min-w-0 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-text-muted">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h5 className="font-medium leading-5">{row.title}</h5>
          <p className="mt-1 text-xs leading-5 text-text-muted">{row.summary}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label={`${expanded ? 'Hide' : 'View'} changes to ${row.title}`}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? 'Hide' : 'View'}
        </Button>
      </div>
      <div
        id={id}
        hidden={!expanded}
        className="mt-3 space-y-3 rounded-lg border border-ui-border bg-background p-3"
      >
        {row.changes.map((change, index) => (
          <div key={index} className="space-y-2">
            <p className="text-xs font-medium">{change.label}</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs leading-5 [overflow-wrap:anywhere]">
              <DiffText {...proposalReviewTexts(change.before, change.after)} />
            </pre>
          </div>
        ))}
        {onInspect && (
          <Button variant="link" size="sm" className="px-0" onClick={onInspect}>
            <Scan aria-hidden="true" />
            Show step on canvas
          </Button>
        )}
      </div>
    </li>
  );
}

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
  const rows = base ? proposalReviewRows(base, proposal) : [];
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
      <details className="group/why border-t border-ui-border pt-1">
        <summary className={disclosureClass}>
          <ChevronRight className="size-4 shrink-0 group-open/why:rotate-90" aria-hidden="true" />
          Why these changes
        </summary>
        <dl className="space-y-3 pb-2 text-text-muted">
          <div>
            <dt className="font-medium text-base-content">Why</dt>
            <dd className="mt-1">{proposal.explanation}</dd>
          </div>
          <div>
            <dt className="font-medium text-base-content">Behavior affected</dt>
            <dd className="mt-1">{proposal.behavior}</dd>
          </div>
        </dl>
      </details>
      {base ? (
        <div className="space-y-4 rounded-xl bg-proposal-soft/50 p-3">
          {[
            { title: 'Global changes', items: rows.filter(row => row.kind !== 'step') },
            { title: 'Step changes', items: rows.filter(row => row.kind === 'step') },
          ]
            .filter(group => group.items.length)
            .map(group => (
              <section
                key={group.title}
                aria-label={group.title}
                className="space-y-3 border-ui-border not-first:border-t not-first:pt-4"
              >
                <h4 className="text-xs font-medium text-text-muted">{group.title}</h4>
                <ul className="divide-y divide-ui-border">
                  {group.items.map(row => {
                    const reference = row.reference;
                    const canInspect =
                      reference &&
                      referenceExists(ready && onPreview ? proposal.candidate : record.agent, reference);
                    return (
                      <ChangeRow
                        key={row.id}
                        row={row}
                        onInspect={
                          reference && !row.removed && canInspect
                            ? () => {
                                if (ready && onPreview) onPreview(proposal, reference);
                                else onFocus(reference);
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted">Saved context is unavailable.</p>
      )}
      <p className="flex items-start gap-1.5 text-xs leading-5 text-text-muted">
        <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Flow is valid · Not tested on a call yet
      </p>
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
            <div className="grid grid-cols-2 gap-2">
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
