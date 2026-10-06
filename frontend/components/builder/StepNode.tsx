'use client';

import { Handle, NodeToolbar, Position, type NodeProps } from '@xyflow/react';
import { Flag, MessageCircle, PhoneOff, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { stepTitle, type StepNode as StepNodeType } from '@/lib/agent/graph';
import { cn } from '@/lib/utils';

export function StepNode({ data, selected }: NodeProps<StepNodeType>) {
  const Icon = data.terminal ? PhoneOff : MessageCircle;
  return <div className={cn('relative w-72 rounded-xl border bg-surface-raised transition-colors duration-150 motion-reduce:transition-none', selected ? 'border-accent' : 'border-ui-border hover:border-text-subtle')}>
    {data.initial && <div className="absolute -top-12 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent-text"><Flag className="size-3" />Start</div>}
    <Handle type="target" position={Position.Top} className="!size-1.5 !border-surface-raised !bg-text-subtle" />
    <div className="p-4">
      <div className="flex items-center gap-2.5"><span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", data.terminal ? "bg-step-ending/10 text-step-ending" : "bg-accent-soft text-accent-text")}><Icon className="size-3.5" /></span><p className="truncate text-sm font-medium">{stepTitle(data.label)}</p></div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">{data.description}</p>
    </div>
    {data.terminal && <div className="px-4 pb-3 text-xs text-step-ending">{data.endsConversation ? 'End conversation' : 'Terminal · Custom actions'}</div>}
    {data.onDelete && <NodeToolbar isVisible={selected} position={Position.Right}><div className="rounded-lg border border-ui-border bg-surface-raised p-1 shadow-sm"><Button type="button" variant="ghost" size="icon" aria-label={`Delete ${data.label}`} className="pointer-coarse:size-11" title="Delete step and its connections" disabled={data.pending} onClick={event => { event.stopPropagation(); data.onDelete?.(); }}><Trash2 /></Button></div></NodeToolbar>}
    {data.onAdd && <Button type="button" variant="outline" size="icon" className="nodrag nopan absolute -bottom-5 left-1/2 z-10 size-8 -translate-x-1/2 rounded-full bg-surface-raised text-accent-text transition-[color,background-color,scale] duration-150 ease-snappy hover:bg-accent-soft active:not-focus-visible:scale-95 motion-reduce:transition-none pointer-coarse:size-11" aria-label={`Add step after ${data.label}`} title="Add connected step" disabled={data.pending} onClick={event => { event.stopPropagation(); data.onAdd?.(); }}><Plus /></Button>}
    <Handle type="source" position={Position.Bottom} className="!size-1.5 !border-surface-raised !bg-text-subtle" />
  </div>;
}

