import { Button } from '@/components/ui/Button';

/** Tells the user whether the canvas shows an unsaved proposal or their current workspace. */
export function ProposalPreviewBanner({
  previewing,
  onToggle,
  onReview,
}: {
  previewing: boolean;
  onToggle: () => void;
  onReview: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Canvas proposal preview"
      className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-proposal/20 bg-proposal-soft px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-proposal">
          {previewing ? 'Proposed workflow' : 'Current workspace'}
          <span className="font-normal"> · {previewing ? 'Not saved' : 'Proposal available'}</span>
        </p>
        <p className="mt-1 text-xs leading-5 text-text-muted">
          {previewing
            ? 'Blue marks new and updated elements. Select a step to inspect it.'
            : 'Your saved agent and manual draft are unchanged.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onToggle}>
          {previewing ? 'Show current workspace' : 'Show proposal'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onReview}>
          Review proposal
        </Button>
      </div>
    </div>
  );
}
