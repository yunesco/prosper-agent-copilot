'use client';

import { useMemo, useRef, useState } from 'react';
import { Background, Panel, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { Maximize, Plus, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button } from '@/components/ui/Button';
import { agentGraph } from '@/lib/agent/graph';
import type { AgentConfig } from '@/lib/agent/schema';
import { cn } from '@/lib/utils';
import { StepNode } from './StepNode';
import { ConditionEdge } from './ConditionEdge';

// Keep renderer imports separate: editing this module must not recreate renderer
// functions during Fast Refresh (React Flow warning 002 compares those identities).
const edgeTypes = { condition: ConditionEdge };
const nodeTypes = { step: StepNode };

function GraphControls({ onAdd, pending }: { onAdd: () => void; pending: boolean }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return <Panel position="top-left" className="flex gap-1 rounded-lg border border-ui-border bg-surface-raised p-1">
    <Button type="button" variant="ghost" size="sm" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" aria-label="Add step" title="Add step" disabled={pending} onClick={onAdd}><Plus className="size-4" /></Button>
    <Button variant="ghost" size="sm" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" aria-label="Zoom out" onClick={() => void zoomOut()}><ZoomOut className="size-4" /></Button>
    <Button variant="ghost" size="sm" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" aria-label="Zoom in" onClick={() => void zoomIn()}><ZoomIn className="size-4" /></Button>
    <Button variant="ghost" size="sm" className="pointer-coarse:min-h-11" onClick={() => void fitView({ padding: 0.3, maxZoom: 1 })}><Maximize className="size-3.5" />Fit</Button>
  </Panel>;
}

export function AgentGraph({ agent, selectedNodeId, onSelect, onSelectTransition, onAddStep, onDeleteStep, pending = false }: { onAddStep?: (name: string, source: string | null, end: boolean, condition: string, goal: string) => void; onDeleteStep?: (name: string) => void; pending?: boolean; agent: AgentConfig; selectedNodeId: string | null; onSelect: (id: string | null) => void; onSelectTransition: (source: string, index: number) => void }) {
  const [adding, setAdding] = useState<{ source: string | null; animate: boolean } | null>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [condition, setCondition] = useState('');
  const [kind, setKind] = useState('conversation');
  const addTrigger = useRef<HTMLElement | null>(null);
  const closeAdd = () => { setAdding(null); addTrigger.current?.focus({ preventScroll: true }); };
  const openAdd = (source: string | null) => { addTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setName(''); setGoal(''); setCondition(''); setKind('conversation'); setAdding({ source, animate: !addTrigger.current?.matches(':focus-visible') }); };
  const graph = useMemo(() => agentGraph(agent), [agent]);
  const edges = useMemo(() => graph.edges.map(edge => ({ ...edge, data: { onInspect: () => {
    const index = graph.edges.filter(item => item.source === edge.source).findIndex(item => item.id === edge.id);
    onSelectTransition(edge.source, index);
  } } })), [graph, onSelectTransition]);
  const nodes = useMemo(() => graph.nodes.map(node => ({ ...node, selected: node.id === selectedNodeId,
    data: { ...node.data, pending, onAdd: onAddStep ? () => openAdd(node.id) : undefined, onDelete: onDeleteStep ? () => { setAdding(null); onDeleteStep(node.id); } : undefined },
    ariaRole: 'button' as const, ariaLabel: `Inspect ${node.id}`, domAttributes: { 'aria-pressed': node.id === selectedNodeId, onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(node.id); } } },
  })), [graph, selectedNodeId, onSelect, onAddStep, onDeleteStep, pending]);
  return <div className="h-full min-h-80" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); if (adding) closeAdd(); else onSelect(null); } }}>
    <ReactFlowProvider><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)} fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }} minZoom={0.2} maxZoom={2}>
      <Background gap={20} size={0.7} /><GraphControls onAdd={() => openAdd(null)} pending={pending || !onAddStep} />
      {adding && <Panel position="top-left" className={cn("!mt-16 max-h-[calc(100%-5rem)] w-80 max-w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-xl bg-surface-raised p-4 shadow-overlay", adding.animate && "motion-safe:transition-[opacity,translate] motion-safe:duration-150 motion-safe:ease-snappy motion-safe:starting:opacity-0 motion-safe:starting:-translate-y-1")}>
        <form aria-label="Add step" className="space-y-4" onSubmit={event => { event.preventDefault(); if (pending || !goal.trim() || (adding.source !== null && !condition.trim()) || !name.trim()) return; onAddStep?.(name, adding.source, kind === 'end', condition, goal); setAdding(null); }}>
          <div className="flex items-center justify-between"><h3 className="text-sm font-medium">{adding.source ? 'Add connected step' : 'Add step'}</h3><Button type="button" variant="ghost" size="icon" aria-label="Close add step" onClick={closeAdd}><X /></Button></div>
          <label className="block space-y-1 text-xs">Step name<Input autoFocus aria-label="Step name" placeholder="e.g. Collect insurance" value={name} onChange={event => setName(event.target.value)} /></label>
          <label className="block space-y-1 text-xs">Step type<NativeSelect aria-label="Step type" value={kind} onChange={event => { setKind(event.target.value); if (event.target.value === 'end' && !goal.trim()) setGoal('Say goodbye.'); }}><NativeSelectOption value="conversation">Conversation</NativeSelectOption><NativeSelectOption value="end">End conversation</NativeSelectOption></NativeSelect></label>
          <label className="block space-y-1.5 text-xs font-medium">Conversation goal<Textarea aria-label="Conversation goal" className="min-h-24 resize-y font-normal leading-6" placeholder="e.g. Ask which insurance provider the caller uses." value={goal} onChange={event => setGoal(event.target.value)} /></label>
          {adding.source !== null && <label className="block space-y-1.5 border-t border-ui-border pt-3 text-xs font-medium">When to enter this step<Textarea aria-label="New transition condition" className="min-h-24 resize-y font-normal leading-6" placeholder="e.g. The caller is a new patient." value={condition} onChange={event => setCondition(event.target.value)} /></label>}

          <Button type="submit" className="h-10 w-full bg-accent-text text-white hover:bg-accent-text/90 transition-[background-color,scale] duration-150 ease-snappy active:not-focus-visible:scale-[0.98] motion-reduce:transition-none" disabled={pending || !goal.trim() || (adding.source !== null && !condition.trim()) || !name.trim()}>Add step</Button>
        </form>
      </Panel>}
    </ReactFlow></ReactFlowProvider>
  </div>;
}
