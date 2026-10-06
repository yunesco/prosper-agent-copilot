import { Button } from '@/components/ui/Button';

export type ContextPane = 'details' | 'copilot';
const tabs: ContextPane[] = ['details', 'copilot'];
const label = { details: 'Details', copilot: 'Copilot' };

/** Details | Copilot tablist with arrow-key navigation. */
export function ContextTabs({
  pane,
  onChange,
}: {
  pane: ContextPane;
  onChange: (pane: ContextPane) => void;
}) {
  return (
    <div role="tablist" aria-label="Context pane" className="flex gap-5">
      {tabs.map(tab => (
        <Button
          key={tab}
          id={`${tab}-tab`}
          role="tab"
          aria-selected={pane === tab}
          aria-controls={`${tab}-panel`}
          tabIndex={pane === tab ? 0 : -1}
          variant="ghost"
          size="sm"
          className="relative h-10 rounded-none border-0 px-0 text-text-muted hover:bg-transparent aria-selected:text-base-content after:absolute after:inset-x-0 after:-bottom-2 after:h-px aria-selected:after:bg-foreground"
          onClick={() => onChange(tab)}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 'details'
                : event.key === 'End'
                  ? 'copilot'
                  : tab === 'details'
                    ? 'copilot'
                    : 'details';
            onChange(next);
            document.getElementById(`${next}-tab`)?.focus();
          }}
        >
          {label[tab]}
        </Button>
      ))}
    </div>
  );
}
