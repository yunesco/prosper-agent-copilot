import type { RefObject } from 'react';
import { AudioLines, GitBranch, Phone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SavedAgent } from '@/lib/agent/repository';

const agentLabel = (id: string) =>
  id === 'clinic-scheduler' ? 'Mocked existing deployed agent' : 'New / generated agent';
const modeClass =
  'h-9 rounded-lg px-3 aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text';

export function WorkspaceHeader({
  agentName,
  records,
  currentId,
  mode,
  triggerRef,
  onSelectAgent,
  onMode,
}: {
  agentName: string;
  records: SavedAgent[];
  currentId: string;
  mode: 'builder' | 'call';
  triggerRef: RefObject<HTMLButtonElement | null>;
  onSelectAgent: (id: string) => void;
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
      <Select value={currentId} onValueChange={value => value && onSelectAgent(value)}>
        <SelectTrigger
          ref={triggerRef}
          aria-label="Saved agent"
          className="order-3 col-span-2 w-full sm:order-none sm:col-span-1"
        >
          <SelectValue>{agentLabel(currentId)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {records.map(item => (
            <SelectItem key={item.id} value={item.id}>
              {agentLabel(item.id)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
