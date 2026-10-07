import type { RefObject } from 'react';
import { AudioLines, GitBranch, Phone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { SavedAgent } from '@/lib/agent/repository';
import { AgentSwitcher } from './AgentSwitcher';

/** Sentinel agent ID for the "create a new agent" switch; never a saved agent ID. */
export const NEW_AGENT = '__new-agent__';

const modeClass =
  'h-9 rounded-lg px-3 aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text';

export function WorkspaceHeader({
  agentName,
  records,
  currentId,
  mode,
  triggerRef,
  onSelectAgent,
  renameLockedReason,
  onCreateAgent,
  onRenameAgent,
  onDeleteAgent,
  onMode,
}: {
  agentName: string;
  records: SavedAgent[];
  currentId: string;
  mode: 'builder' | 'call';
  triggerRef: RefObject<HTMLButtonElement | null>;
  onSelectAgent: (id: string) => void;
  renameLockedReason: string | null;
  onCreateAgent: (name: string) => void;
  onRenameAgent: (id: string, name: string) => Promise<void>;
  onDeleteAgent: (id: string) => void;
  onMode: (mode: 'builder' | 'call') => void;
}) {
  return (
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-3 border-b border-ui-border bg-surface-raised px-4 py-3 sm:grid-cols-[minmax(0,1fr)_18rem_auto] md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <AudioLines aria-hidden="true" className="size-5 shrink-0" />
        <h1 title={agentName} className="min-w-0 truncate text-sm font-medium">
          {agentName}
        </h1>
      </div>
      <div className="order-3 col-span-2 min-w-0 sm:order-none sm:col-span-1">
        <AgentSwitcher
          records={records}
          currentId={currentId}
          triggerRef={triggerRef}
          renameLockedReason={renameLockedReason}
          onSelect={onSelectAgent}
          onCreate={onCreateAgent}
          onRename={onRenameAgent}
          onDelete={onDeleteAgent}
        />
      </div>
      <nav aria-label="Agent mode" className="inline-flex items-center justify-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className={modeClass}
          aria-current={mode === 'builder' ? 'page' : undefined}
          onClick={() => onMode('builder')}
        >
          <GitBranch aria-hidden="true" />
          Builder
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={modeClass}
          aria-current={mode === 'call' ? 'page' : undefined}
          onClick={() => onMode('call')}
        >
          <Phone aria-hidden="true" />
          Test Call
        </Button>
      </nav>
    </header>
  );
}
