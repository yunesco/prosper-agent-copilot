'use client';

import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, MarkerType, Panel, ReactFlow, ReactFlowProvider, useReactFlow, type XYPosition } from '@xyflow/react';
import { Maximize, Plus, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

function GraphCanvas({ initialPositions, onPositionsChange, agent, selectedTransitionFunction = null, selectedNodeId, onSelect, onSelectTransition, onAddStep, onDeleteStep, onConnectSteps, onReconnectStep, pending = false }: { initialPositions?: Record<string, XYPosition>; onPositionsChange?: (positions: Record<string, XYPosition>) => void; selectedTransitionFunction?: string | null; onConnectSteps?: (source: string, target: string) => void; onReconnectStep?: (source: string, name: string, nextSource: string, target: string) => void; onAddStep?: (name: string, source: string | null, end: boolean, condition: string, goal: string) => string; onDeleteStep?: (name: string) => void; pending?: boolean; agent: AgentConfig; selectedNodeId: string | null; onSelect: (id: string | null) => void; onSelectTransition: (source: string, index: number) => void }) {
  const { screenToFlowPosition } = useReactFlow();
  const container = useRef<HTMLDivElement>(null);
  const reconnecting = useRef(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ source: string | null; animate: boolean; point?: XYPosition; position?: XYPosition } | null>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [condition, setCondition] = useState('');
  const [kind, setKind] = useState('conversation');
  const addTrigger = useRef<HTMLElement | null>(null);
  const closeAdd = () => { setAdding(null); addTrigger.current?.focus({ preventScroll: true }); };
  const openAdd = useCallback((source: string | null, point?: XYPosition) => {
    addTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bounds = container.current?.getBoundingClientRect();
    const anchor = point ?? (source ? (() => { const rect = addTrigger.current?.getBoundingClientRect(); return rect ? { x: rect.left, y: rect.bottom + 8 } : undefined; })() : undefined);
    const local = bounds && anchor ? { x: Math.max(16, Math.min(anchor.x - bounds.left, bounds.width - 336)), y: Math.max(64, Math.min(anchor.y - bounds.top, bounds.height - 540)) } : undefined;
    setName(''); setGoal(''); setCondition(''); setKind('conversation');
    setAdding({ source, animate: !addTrigger.current?.matches(':focus-visible'), point: local, position: point ? screenToFlowPosition(point) : undefined });
  }, [screenToFlowPosition]);
  const graph = useMemo(() => agentGraph(agent), [agent]);
  const [positions, setPositions] = useState<Record<string, XYPosition>>(() => initialPositions || Object.fromEntries(graph.nodes.map(node => [node.id, node.position])));
  useEffect(() => { onPositionsChange?.(positions); }, [onPositionsChange, positions]);
  const [measurements, setMeasurements] = useState<Record<string, { width: number; height: number }>>({});
  // Retain presentation positions across topology edits; new steps get the initial layout.
  if (graph.nodes.some(node => !positions[node.id])) {
    setPositions(current => ({ ...Object.fromEntries(graph.nodes.map(node => [node.id, node.position])), ...current }));
  }
  const dropPoint = (event: MouseEvent | TouchEvent) => {
    const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
    return pointer ? { x: pointer.clientX, y: pointer.clientY } : null;
  };
  const dropNode = (point: XYPosition) => document.elementFromPoint(point.x, point.y)?.closest('.react-flow__node')?.getAttribute('data-id');
  const reconnect = (id: string, source: string, nextSource: string, target: string) => {
    const index = graph.edges.filter(item => item.source === source).findIndex(item => item.id === id);
    const transition = agent.nodes.find(node => node.name === source)?.edges[index];
    if (transition && (transition.target !== target || source !== nextSource)) onReconnectStep?.(source, transition.function, nextSource, target);
  };
  const edges = useMemo(() => graph.edges.map(edge => ({ ...edge, selected: edge.source === selectedNodeId && edge.data?.function === selectedTransitionFunction, reconnectable: !pending && !!onReconnectStep, markerEnd: { type: MarkerType.ArrowClosed }, data: { onInspect: () => {
    const index = graph.edges.filter(item => item.source === edge.source).findIndex(item => item.id === edge.id);
    onSelectTransition(edge.source, index);
  } } })), [graph, onSelectTransition, onReconnectStep, pending, selectedNodeId, selectedTransitionFunction]);
  const nodes = useMemo(() => graph.nodes.map(node => ({ ...node, position: positions[node.id] ?? node.position, measured: measurements[node.id], selected: node.id === selectedNodeId,
    data: { ...node.data, pending, connecting: connecting !== null && connecting !== node.id, onAdd: onAddStep ? () => openAdd(node.id) : undefined, onDelete: onDeleteStep ? () => { setAdding(null); onDeleteStep(node.id); } : undefined },
    ariaRole: 'button' as const, ariaLabel: `Inspect ${node.id}`, domAttributes: { 'aria-pressed': node.id === selectedNodeId, onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(node.id); } } },
  })), [graph, positions, measurements, connecting, selectedNodeId, onSelect, onAddStep, onDeleteStep, pending, openAdd]);
  return <div ref={container} className="relative h-full min-h-80" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); if (adding) closeAdd(); else onSelect(null); } }}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      nodesDraggable={!pending} nodeDragThreshold={5} connectOnClick={false}
      onNodesChange={changes => {
        if (changes.some(change => change.type === 'position')) setPositions(current => { const next = { ...current }; for (const change of changes) if (change.type === 'position' && change.position) next[change.id] = change.position; return next; });
        // Controlled nodes must retain React Flow's measured dimensions. Dropping
        // these on rerender resets initialization and makes every node hidden.
        if (changes.some(change => change.type === 'dimensions')) setMeasurements(current => { const next = { ...current }; for (const change of changes) if (change.type === 'dimensions' && change.dimensions) next[change.id] = change.dimensions; return next; });
      }} nodesConnectable={!pending && !!onConnectSteps} edgesFocusable={false} deleteKeyCode={null}
      connectionRadius={28} reconnectRadius={16}
      onConnect={({ source, target }) => { if (!pending) onConnectSteps?.(source, target); }}
      onConnectStart={(_, params) => { setAdding(null); setConnecting(params.nodeId); }}
      onConnectEnd={(event, state) => {
        setConnecting(null);
        if (pending || reconnecting.current || state.isValid || state.fromHandle?.type !== 'source') return;
        const point = dropPoint(event);
        if (!point || !state.fromNode) return;
        const target = dropNode(point);
        if (target && target !== state.fromNode.id) onConnectSteps?.(state.fromNode.id, target);
        else if (!target && document.elementFromPoint(point.x, point.y)?.classList.contains('react-flow__pane')) openAdd(state.fromNode.id, point);
      }}
      onReconnectStart={(_, edge) => { reconnecting.current = true; setConnecting(edge.source); }}
      onReconnect={(edge, connection) => { if (!pending) reconnect(edge.id, edge.source, connection.source, connection.target); }}
      onReconnectEnd={(event, edge, fixedHandleType, state) => {
        reconnecting.current = false;
        setConnecting(null);
        if (pending || state.isValid) return;
        const point = dropPoint(event);
        const target = point && dropNode(point);
        // React Flow reports the stationary (opposite) handle here.
        if (target) reconnect(edge.id, edge.source, fixedHandleType === 'target' ? target : edge.source, fixedHandleType === 'source' ? target : edge.target);
      }}
      onEdgeClick={(_, edge) => edge.data?.onInspect()}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)} fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }} minZoom={0.2} maxZoom={2}>
      <Background gap={20} size={0.7} /><GraphControls onAdd={() => openAdd(null)} pending={pending || !onAddStep} />
      {adding && <Panel position="top-left" style={adding.point ? { left: adding.point.x, top: adding.point.y } : undefined} className={cn(adding.point ? "!m-0" : "!mt-16", " max-h-[calc(100%-5rem)] w-80 max-w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-xl bg-surface-raised p-4 shadow-overlay", adding.animate && "motion-safe:transition-[opacity,translate] motion-safe:duration-150 motion-safe:ease-snappy motion-safe:starting:opacity-0 motion-safe:starting:-translate-y-1")}>
        <form aria-label="Add step" className="space-y-4" onSubmit={event => { event.preventDefault(); if (pending || !goal.trim() || (adding.source !== null && !condition.trim()) || !name.trim()) return; const nodeId = onAddStep?.(name, adding.source, kind === 'end', condition, goal); if (nodeId && adding.position) setPositions(current => ({ ...current, [nodeId]: adding.position! })); setAdding(null); }}>
          <div className="flex items-center justify-between"><h3 className="text-sm font-medium">{adding.source ? 'Add connected step' : 'Add step'}</h3><Button type="button" variant="ghost" size="icon" aria-label="Close add step" onClick={closeAdd}><X /></Button></div>
          <label className="block space-y-1 text-xs">Step name<Input autoFocus aria-label="Step name" placeholder="e.g. Collect insurance" value={name} onChange={event => setName(event.target.value)} /></label>
          <label className="block space-y-1 text-xs">Step type<Select value={kind} onValueChange={value => { if (!value) return; setKind(value); if (value === 'end' && !goal.trim()) setGoal('Say goodbye.'); }}><SelectTrigger aria-label="Step type"><SelectValue>{kind === 'end' ? 'End conversation' : 'Conversation'}</SelectValue></SelectTrigger><SelectContent><SelectItem value="conversation">Conversation</SelectItem><SelectItem value="end">End conversation</SelectItem></SelectContent></Select></label>
          <label className="block space-y-1.5 text-xs font-medium">Conversation goal<Textarea aria-label="Conversation goal" className="min-h-24 resize-y font-normal leading-6" placeholder="e.g. Ask which insurance provider the caller uses." value={goal} onChange={event => setGoal(event.target.value)} /></label>
          {adding.source !== null && <label className="block space-y-1.5 border-t border-ui-border pt-3 text-xs font-medium">When to enter this step<Textarea aria-label="New transition condition" className="min-h-24 resize-y font-normal leading-6" placeholder="e.g. The caller is a new patient." value={condition} onChange={event => setCondition(event.target.value)} /></label>}

          <Button type="submit" className="h-10 w-full bg-accent-text text-white hover:bg-accent-text/90 transition-[background-color,scale] duration-150 ease-snappy active:not-focus-visible:scale-[0.98] motion-reduce:transition-none" disabled={pending || !goal.trim() || (adding.source !== null && !condition.trim()) || !name.trim()}>Add step</Button>
        </form>
      </Panel>}
    </ReactFlow>
  </div>;
}

export function AgentGraph(props: ComponentProps<typeof GraphCanvas>) {
  return <ReactFlowProvider><GraphCanvas {...props} /></ReactFlowProvider>;
}
