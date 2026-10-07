'use client';

import { Check, ChevronRight, CircleHelp, ListChecks } from 'lucide-react';
import { MarkdownContent } from '@/components/chat/MarkdownContent';
import { Button } from '@/components/ui/Button';
import { focusRing } from '@/components/ui/focus';
import type { BehaviorReview, GraphReference } from '@/lib/agent/proposals';
import type { SavedAgent } from '@/lib/agent/repository';
import { GraphLink } from './GraphLink';

const findingLabels = {
  aligned: 'Aligned',
  potential_mismatch: 'Potential mismatch',
  ambiguous: 'Needs clarification',
};

/** A read-only model assessment of the saved guidelines; findings can start a targeted proposal. */
export function BehaviorReviewCard({
  review,
  record,
  busy,
  onSend,
  onFocus,
}: {
  review: BehaviorReview;
  record: SavedAgent;
  busy: boolean;
  onSend: (text: string, expect?: 'proposal') => void;
  onFocus: (ref: GraphReference) => void;
}) {
  const current = review.agentId === record.id && review.revision === record.revision;
  const mismatches = review.behaviors.filter(item => item.status === 'potential_mismatch');
  const ambiguous = review.behaviors.filter(item => item.status === 'ambiguous').length;
  const aligned = review.behaviors.filter(item => item.status === 'aligned').length;
  const disabled = busy || !current;
  return (
    <section
      aria-label="Behavior review"
      data-chat-reveal
      className="mt-6 min-w-0 border-t border-ui-border pt-5 text-sm [overflow-wrap:anywhere]"
    >
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Behavior review</h3>
          <span className="text-xs text-text-muted">
            {current ? 'Current' : 'Out of date'} · Revision {review.revision}
          </span>
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-text-muted">
          <span className={mismatches.length ? 'font-medium text-base-content' : ''}>
            {mismatches.length} potential {mismatches.length === 1 ? 'mismatch' : 'mismatches'}
          </span>
          <span>
            {ambiguous} {ambiguous === 1 ? 'needs' : 'need'} clarification
          </span>
          <span>{aligned} aligned</span>
        </p>
        {mismatches.length > 0 && (
          <div className="space-y-2">
            <Button
              className="h-10 w-full gap-2"
              disabled={disabled}
              onClick={() =>
                onSend(
                  [
                    'Propose one combined change addressing all potential mismatches below from this model review of the saved agent. Submit one atomic propose_agent_patch batch for human review and Apply. Preserve unrelated configuration. Do not resolve ambiguous requirements by guessing; ask for clarification when needed.',
                    ...mismatches.map(
                      (item, index) =>
                        `${index + 1}. ${item.behavior}\nFinding: ${item.finding}\nGuideline: ${item.excerpt}\nReferences: ${JSON.stringify(item.references)}`,
                    ),
                  ].join('\n\n'),
                  'proposal',
                )
              }
            >
              <ListChecks aria-hidden="true" className="size-4" />
              Propose all changes
            </Button>
            <p className="text-xs leading-5 text-text-muted">
              One proposal to review and Apply. Ambiguities stay separate.
            </p>
          </div>
        )}
        {!current && (
          <p className="text-xs leading-5 text-text-muted">
            The saved agent changed. Run a new review before proposing changes.
          </p>
        )}
      </header>
      <details className="group/overview mt-3">
        <summary
          className={`flex min-h-10 cursor-pointer list-none items-center gap-2 rounded text-xs text-text-muted ${focusRing}`}
        >
          <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 group-open/overview:rotate-90" />
          Read model overview
        </summary>
        <div className="pb-4">
          <MarkdownContent>{review.summary}</MarkdownContent>
        </div>
      </details>
      <div className="mt-2 divide-y divide-ui-border border-y border-ui-border">
        {review.behaviors.map((item, index) => (
          <div key={index} className="py-4">
            <details className="group/finding">
              <summary
                className={`flex min-h-11 cursor-pointer list-none items-start gap-3 rounded ${focusRing}`}
              >
                {item.status === 'aligned' ? (
                  <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-text-muted" />
                ) : item.status === 'ambiguous' ? (
                  <CircleHelp aria-hidden="true" className="mt-1 size-4 shrink-0 text-text-muted" />
                ) : (
                  <ListChecks aria-hidden="true" className="mt-1 size-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-5">{item.behavior}</span>
                  <span className="mt-1 block text-xs leading-5 text-text-muted">
                    {findingLabels[item.status]}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0 text-text-muted group-open/finding:rotate-90"
                />
              </summary>
              <div className="mt-3 space-y-3">
                <MarkdownContent>{item.finding}</MarkdownContent>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-text-muted">Saved guideline</p>
                  <blockquote className="border-l border-ui-border-strong pl-3 text-sm leading-6 text-text-muted">
                    {item.excerpt}
                  </blockquote>
                </div>
                {item.clarification && (
                  <div className="rounded-lg bg-surface p-3">
                    <p className="mb-1 text-xs font-medium">Clarification needed</p>
                    <MarkdownContent>{item.clarification}</MarkdownContent>
                  </div>
                )}
                {item.references.length > 0 && (
                  <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                    {item.references.map((ref, i) => (
                      <GraphLink key={i} reference={ref} record={record} onFocus={onFocus} />
                    ))}
                  </div>
                )}
              </div>
            </details>
            {item.status !== 'aligned' && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-9"
                disabled={disabled}
                onClick={() =>
                  onSend(
                    item.status === 'ambiguous'
                      ? `Propose a targeted change for this ambiguous model-review finding: ${item.behavior}. ${item.finding} Use the most reasonable reading, state the assumption in your summary, and keep the change easy to revise.`
                      : `Propose a targeted change for this model-review finding: ${item.behavior}. ${item.finding}`,
                    'proposal',
                  )
                }
              >
                {item.status === 'ambiguous' ? 'Propose change (assume default)' : 'Propose change'}
              </Button>
            )}
          </div>
        ))}
        {review.behaviors.length === 0 && (
          <p className="py-4 text-sm text-text-muted">No findings returned. Read the overview for context.</p>
        )}
      </div>
      <p className="mt-3 text-xs leading-5 text-text-muted">
        Model assessment of saved guidelines. Conversation checks have not run.
      </p>
    </section>
  );
}
