'use client';

import { useEffect, useRef } from 'react';
import { Handle, NodeToolbar, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Flag, MessageCircle, PhoneOff, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { stepTitle, type StepNode as StepNodeType } from '@/lib/agent/graph';
import { cn } from '@/lib/utils';

export function StepNode({ id, data, selected }: NodeProps<StepNodeType>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const incomingIds = JSON.stringify([
    data.incoming.map(item => item.id),
    data.outgoing.map(item => item.id),
  ]);
  const previousIncoming = useRef(incomingIds);
  useEffect(() => {
    // ResizeObserver measures all cards on mount. An eager per-card update
    // consumes React Flow's initial fitView before the other cards are measured.
    if (previousIncoming.current !== incomingIds) {
      previousIncoming.current = incomingIds;
      updateNodeInternals(id);
    }
  }, [id, incomingIds, updateNodeInternals]);
  const Icon = data.terminal ? PhoneOff : MessageCircle;
  return (
    <div
      className={cn(
        'group relative w-72 rounded-xl border bg-surface-raised transition-colors duration-150 motion-reduce:transition-none',
        data.connecting && 'hover:ring-2 hover:ring-accent hover:bg-accent-soft',
        data.proposalChange
          ? 'border-proposal bg-proposal-soft'
          : selected
            ? 'border-foreground'
            : 'border-ui-border hover:border-text-subtle',
        data.proposalChange && selected && 'outline-2 outline-offset-2 outline-proposal',
      )}
    >
      {data.initial && (
        <div className="absolute -top-10 left-4 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ui-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-text-muted">
          <Flag aria-hidden="true" className="size-3" />
          Start
        </div>
      )}
      {(data.incoming.length ? data.incoming : [{ id: 'new', source: '' }]).map((item, index, items) => (
        <Handle
          key={item.id}
          id={item.id}
          type="target"
          position={Position.Top}
          isConnectableStart={false}
          aria-label={`Connect to ${data.label}${item.source ? ` from ${item.source}` : ''}`}
          title={item.source ? `From ${stepTitle(item.source)}` : 'Drop a connection here'}
          style={{ left: `${((index + 1) * 100) / (items.length + 1)}%` }}
          className="!size-2 !border !border-surface-raised !bg-text-subtle [&.valid]:!bg-accent"
        />
      ))}
      <div className="p-4">
        {data.proposalChange && (
          <p className="mb-2 text-xs font-medium text-proposal">
            Proposed · {data.proposalChange === 'added' ? 'New' : 'Updated'}
          </p>
        )}
        <div className="flex min-h-7 items-center gap-2.5">
          <Icon aria-hidden="true" strokeWidth={1.6} className="size-4 shrink-0 text-text-muted" />
          <p title={stepTitle(data.label)} className="min-w-0 truncate text-sm font-medium">
            {stepTitle(data.label)}
          </p>
        </div>
        <p
          title={data.description}
          className="mt-1.5 line-clamp-2 text-xs leading-5 text-text-muted [overflow-wrap:anywhere]"
        >
          {data.description}
        </p>
      </div>
      {data.terminal && (
        <div className="px-4 pb-3 text-xs text-text-muted">
          {data.endsConversation ? 'End conversation' : 'Terminal · Custom actions'}
        </div>
      )}
      {data.onDelete && (
        <NodeToolbar isVisible={selected} position={Position.Right}>
          <div className="rounded-lg border border-ui-border bg-surface-raised p-1 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Delete ${data.label}`}
              className="pointer-coarse:size-11"
              title="Delete step and its connections"
              disabled={data.pending}
              onClick={event => {
                event.stopPropagation();
                data.onDelete?.();
              }}
            >
              <Trash2 />
            </Button>
          </div>
        </NodeToolbar>
      )}
      {data.outgoing.map((item, index) => (
        <Handle
          key={item.id}
          id={item.id}
          type="source"
          position={Position.Bottom}
          isConnectableStart={false}
          style={{ left: `${((index + 1) * 100) / (data.outgoing.length + 2)}%` }}
          className="!size-2 !border !border-surface-raised !bg-text-subtle"
        />
      ))}
      {!data.readOnly && (
        <Handle
          id="new"
          style={{ left: `${((data.outgoing.length + 1) * 100) / (data.outgoing.length + 2)}%` }}
          type="source"
          position={Position.Bottom}
          role="button"
          tabIndex={0}
          aria-disabled={data.pending}
          aria-label={`Add step after ${data.label}`}
          title="Drag to connect · Click to add a step"
          onClick={event => {
            event.stopPropagation();
            if (!data.pending) data.onAdd?.();
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              if (!data.pending) data.onAdd?.();
            }
          }}
          className="!flex !size-6 pointer-coarse:!size-8 !items-center !justify-center !rounded-full !border !border-ui-border !bg-surface-raised !text-text-muted transition-colors hover:!bg-foreground hover:!text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&.connectionindicator]:!cursor-crosshair"
        >
          <Plus aria-hidden="true" className="pointer-events-none size-3.5" />
        </Handle>
      )}
    </div>
  );
}
