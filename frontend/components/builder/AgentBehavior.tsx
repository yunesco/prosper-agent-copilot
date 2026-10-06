import { ListChecks, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { BehaviorReview } from '@/lib/agent/proposals';

export function AgentBehavior({
  review,
  revision,
  hasGuidelines,
  busy,
  onReview,
}: {
  review?: BehaviorReview;
  revision: number;
  hasGuidelines: boolean;
  busy: boolean;
  onReview: () => void;
}) {
  const mismatches = review?.behaviors.filter(item => item.status === 'potential_mismatch').length ?? 0;
  const status = !review
    ? 'Not reviewed'
    : review.revision !== revision
      ? 'Out of date'
      : `${mismatches} potential ${mismatches === 1 ? 'mismatch' : 'mismatches'}`;
  return (
    <section className="space-y-3 border-t border-ui-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Agent behavior</h3>
        <span className="rounded-md bg-surface px-2 py-1 text-xs text-text-muted">{status}</span>
      </div>
      <p className="text-sm leading-6 text-text-muted">
        Compare saved guidelines with the workflow to find potential gaps.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 gap-2 px-3"
        disabled={!hasGuidelines || busy}
        onClick={onReview}
      >
        {busy ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <ListChecks aria-hidden="true" className="size-4" />
        )}
        Review behavior
      </Button>
      <p className="text-xs leading-5 text-text-muted">
        {!hasGuidelines
          ? 'Add and save guidelines to review behavior.'
          : 'Model review, not tested compliance.'}
      </p>
    </section>
  );
}
