import { useRef, useState, type RefObject } from 'react';
import { Check, ChevronsUpDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DEPLOYED_ID, type SavedAgent } from '@/lib/agent/repository';
import { cn } from '@/lib/utils';

/** Returns the trimmed name, or the reason it cannot be used. `ownId` lets an agent keep its own name. */
export function validateAgentName(
  name: string,
  records: SavedAgent[],
  ownId?: string,
): { name: string; error?: undefined } | { error: string; name?: undefined } {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Enter a name for the agent.' };
  if (
    records.some(item => item.id !== ownId && item.agent.name.trim().toLowerCase() === trimmed.toLowerCase())
  )
    return { error: 'An agent with this name already exists.' };
  return { name: trimmed };
}

type Mode = { kind: 'rename' | 'delete'; id: string } | { kind: 'create' } | null;

const rowAction =
  'size-8 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none focus-visible:opacity-100 active:scale-[0.97]';

function NameField({
  initial,
  label,
  submit,
  error,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: string;
  label: string;
  submit: string;
  error: string;
  busy: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="grid gap-1.5 px-1 py-1"
      onSubmit={event => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          aria-label={label}
          aria-invalid={Boolean(error)}
          className="h-9"
          placeholder="e.g. Dental front desk"
          value={value}
          onFocus={event => event.currentTarget.select()}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
        />
        <Button type="submit" size="sm" disabled={busy} className="h-9 active:scale-[0.97]">
          {submit}
        </Button>
      </div>
      {error && (
        <p role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * The saved-agent picker: one popover to switch, rename, delete and add agents.
 * Destructive and naming steps happen inline in the row, so nothing needs a modal.
 */
export function AgentSwitcher({
  records,
  currentId,
  triggerRef,
  renameLockedReason,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  records: SavedAgent[];
  currentId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Set while the open agent has an unsaved draft, which a rename would silently skip. */
  renameLockedReason: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const currentRow = useRef<HTMLButtonElement>(null);
  const current = records.find(item => item.id === currentId);
  const reset = () => {
    setMode(null);
    setError('');
  };
  const start = (next: Mode) => {
    setError('');
    setMode(next);
  };
  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger
        ref={triggerRef}
        aria-label="Saved agent"
        className="flex h-10 w-full min-w-0 touch-manipulation items-center justify-between gap-2 rounded-lg border border-input bg-background py-2 pr-2 pl-3 text-sm outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none pointer-coarse:min-h-11 dark:bg-input/30 dark:hover:bg-input/50"
      >
        <span className="truncate">{current?.agent.name}</span>
        <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent initialFocus={currentRow}>
        <ul role="group" aria-label="Agents" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {records.map(item => {
            const isCurrent = item.id === currentId;
            const locked = isCurrent && renameLockedReason;
            if (mode?.kind === 'rename' && mode.id === item.id)
              return (
                <li key={item.id}>
                  <NameField
                    initial={item.agent.name}
                    label={`Rename ${item.agent.name}`}
                    submit="Save"
                    error={error}
                    busy={busy}
                    onCancel={reset}
                    onSubmit={async value => {
                      const result = validateAgentName(value, records, item.id);
                      if (result.error !== undefined) return setError(result.error);
                      if (result.name === item.agent.name) return reset();
                      setBusy(true);
                      try {
                        await onRename(item.id, result.name);
                        reset();
                      } catch (failure) {
                        setError(failure instanceof Error ? failure.message : 'Could not rename the agent.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </li>
              );
            if (mode?.kind === 'delete' && mode.id === item.id)
              return (
                <li
                  key={item.id}
                  className="grid gap-2 rounded-lg bg-destructive/10 p-2.5"
                  onKeyDown={event => event.key === 'Escape' && (event.stopPropagation(), reset())}
                >
                  <p className="text-sm">
                    <span className="font-medium">Delete {item.agent.name}?</span>{' '}
                    <span className="text-muted-foreground">
                      Its saved version{isCurrent ? ' and any unsaved changes' : ''} will be removed from this
                      browser.
                    </span>
                  </p>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      autoFocus
                      size="sm"
                      variant="ghost"
                      className="active:scale-[0.97]"
                      onClick={reset}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="active:scale-[0.97]"
                      onClick={() => {
                        setOpen(false);
                        reset();
                        onDelete(item.id);
                      }}
                    >
                      Delete agent
                    </Button>
                  </div>
                </li>
              );
            return (
              <li
                key={item.id}
                className={cn(
                  'group/row flex items-center rounded-lg pr-1 transition-colors duration-150 hover:bg-muted motion-reduce:transition-none',
                  isCurrent && 'bg-accent-soft/60',
                )}
              >
                <button
                  ref={isCurrent ? currentRow : undefined}
                  type="button"
                  aria-current={isCurrent ? 'true' : undefined}
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pr-1 pl-2.5 text-left outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 pointer-coarse:min-h-11"
                  onClick={() => {
                    setOpen(false);
                    reset();
                    if (!isCurrent) onSelect(item.id);
                  }}
                >
                  <Check
                    aria-hidden="true"
                    className={cn('size-4 shrink-0 text-accent-text', !isCurrent && 'invisible')}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.agent.name}</span>
                  {item.id === DEPLOYED_ID && (
                    <span
                      title="Mocked existing deployed agent"
                      className="shrink-0 rounded-sm bg-muted px-1.5 text-xs whitespace-nowrap text-muted-foreground"
                    >
                      Deployed
                    </span>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={rowAction}
                  aria-label={`Rename ${item.agent.name}`}
                  aria-disabled={locked ? true : undefined}
                  title={locked || 'Rename'}
                  onClick={() => {
                    if (locked) return setError(locked);
                    start({ kind: 'rename', id: item.id });
                  }}
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={rowAction}
                  aria-label={`Delete ${item.agent.name}`}
                  disabled={records.length === 1}
                  title={records.length === 1 ? 'The last agent cannot be deleted' : 'Delete'}
                  onClick={() => start({ kind: 'delete', id: item.id })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
        {error && mode === null && (
          <p role="alert" className="px-2.5 pt-1.5 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-1.5 border-t border-ui-border pt-1.5">
          {mode?.kind === 'create' ? (
            <NameField
              initial=""
              label="New agent name"
              submit="Create"
              error={error}
              busy={false}
              onCancel={reset}
              onSubmit={value => {
                const result = validateAgentName(value, records);
                if (result.error !== undefined) return setError(result.error);
                setOpen(false);
                reset();
                onCreate(result.name);
              }}
            />
          ) : (
            <Button
              variant="ghost"
              className="h-10 w-full justify-start gap-2 px-2.5 text-accent-text active:scale-[0.97] pointer-coarse:min-h-11"
              onClick={() => start({ kind: 'create' })}
            >
              <Plus aria-hidden="true" />
              Add agent
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
