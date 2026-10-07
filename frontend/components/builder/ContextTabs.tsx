import { Button } from '@/components/ui/Button';

export type ContextPane = 'details' | 'calls' | 'copilot';
const tabs: ContextPane[] = ['copilot', 'calls', 'details'];
const label = { details: 'Details', calls: 'Calls', copilot: 'Copilot' };

/** Copilot | Calls | Details tablist with arrow-key navigation. */
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
            const at = tabs.indexOf(tab);
            const next =
              event.key === 'Home'
                ? tabs[0]
                : event.key === 'End'
                  ? tabs[tabs.length - 1]
                  : tabs[(at + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
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
