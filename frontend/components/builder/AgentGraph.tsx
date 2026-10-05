'use client';

import { useMemo } from 'react';
import { Background, BaseEdge, EdgeLabelRenderer, getBezierPath, Handle, Panel, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type EdgeProps, type NodeProps } from '@xyflow/react';
import { ArrowDown, Flag, Maximize, MessageCircle, Minus, PhoneOff, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { agentGraph, stepTitle, type StepNode } from '@/lib/agent/graph';
import type { AgentConfig } from '@/lib/agent/schema';
import { cn } from '@/lib/utils';

function Step({ data, selected }: NodeProps<StepNode>) {
  const Icon = data.terminal ? PhoneOff : MessageCircle;
  return <div className={cn('relative w-72 rounded-xl border bg-surface-raised shadow-sm transition-colors', selected ? 'border-foreground ring-2 ring-foreground/10' : 'border-ui-border hover:border-text-subtle')}>
    {data.initial && <div className="absolute -top-12 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-ui-border bg-surface-raised px-3 py-1.5 text-xs"><Flag className="size-3" />Start</div>}
    <Handle type="target" position={Position.Top} className="!size-1.5 !border-surface-raised !bg-text-subtle" />
    <div className="p-4">
      <div className="flex items-center gap-2.5"><Icon className="size-4 shrink-0 text-text-muted" /><p className="truncate text-sm font-medium">{stepTitle(data.label)}</p></div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">{data.description}</p>
    </div>
    {data.terminal && <div className="border-t border-ui-border px-4 py-2 text-xs text-text-subtle">{data.endsConversation ? 'End conversation' : 'Terminal · Custom actions'}</div>}
    <Handle type="source" position={Position.Bottom} className="!size-1.5 !border-surface-raised !bg-text-subtle" />
  </div>;
}

function ConditionEdge(props: EdgeProps<Edge<{ onInspect: () => void }>>) {
  const [path, x, y] = getBezierPath(props);
  return <>
    <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} />
    <EdgeLabelRenderer><Button size="sm" onClick={props.data?.onInspect} aria-label={`Inspect transition: ${props.label}`} title={typeof props.label === 'string' ? props.label : undefined} style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
      className="nodrag nopan pointer-events-auto absolute flex h-auto max-w-64 items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1.5 text-[10px] text-background shadow-sm">
      <ArrowDown className="size-3 shrink-0" /><span className="truncate">{props.label}</span>
    </Button></EdgeLabelRenderer>
  </>;
}
const edgeTypes = { condition: ConditionEdge };
const nodeTypes = { step: Step };

function GraphControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return <Panel position="top-left" className="flex gap-1 rounded-lg border border-ui-border bg-surface-raised p-1">
    <Button variant="ghost" size="sm" aria-label="Zoom out" onClick={() => void zoomOut()}><Minus className="size-4" /></Button>
    <Button variant="ghost" size="sm" aria-label="Zoom in" onClick={() => void zoomIn()}><Plus className="size-4" /></Button>
    <Button variant="ghost" size="sm" onClick={() => void fitView({ padding: 0.16 })}><Maximize className="size-3.5" />Fit</Button>
  </Panel>;
}

export function AgentGraph({ agent, selectedNodeId, onSelect, onSelectTransition }: { agent: AgentConfig; selectedNodeId: string | null; onSelect: (id: string | null) => void; onSelectTransition: (source: string, index: number) => void }) {
  const graph = useMemo(() => agentGraph(agent), [agent]);
  const edges = useMemo(() => graph.edges.map(edge => ({ ...edge, data: { onInspect: () => {
    const index = graph.edges.filter(item => item.source === edge.source).findIndex(item => item.id === edge.id);
    onSelectTransition(edge.source, index);
  } } })), [graph, onSelectTransition]);
  const nodes = useMemo(() => graph.nodes.map(node => ({ ...node, selected: node.id === selectedNodeId,
    ariaRole: 'button' as const, ariaLabel: `Inspect ${node.id}`, domAttributes: { 'aria-pressed': node.id === selectedNodeId, onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id); } } },
  })), [graph, selectedNodeId, onSelect]);
  return <div className="h-full min-h-80" onKeyDown={event => { if (event.key === 'Escape') onSelect(null); }}>
    <ReactFlowProvider><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)} fitView fitViewOptions={{ padding: 0.16 }} minZoom={0.2} maxZoom={2}>
      <Background gap={20} size={0.7} /><GraphControls />
    </ReactFlow></ReactFlowProvider>
  </div>;
}
