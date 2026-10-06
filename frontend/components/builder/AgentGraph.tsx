'use client';

import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesInitialized,
  useStore,
  type XYPosition,
} from '@xyflow/react';
import { Maximize, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { graphViewport, layoutGraph, type Size } from '@/lib/agent/graph-layout';
import { agentGraph, graphTopology } from '@/lib/agent/graph';
import type { AgentConfig } from '@/lib/agent/schema';
import type { ProposalGraphChanges } from '@/lib/agent/proposal-graph';
import type { GraphReference } from '@/lib/agent/proposals';
import { StepNode } from './StepNode';
import { AddStepPanel } from './AddStepPanel';
import { ConditionEdge } from './ConditionEdge';

// Keep renderer imports separate: editing this module must not recreate renderer
// functions during Fast Refresh (React Flow warning 002 compares those identities).
const edgeTypes = { condition: ConditionEdge };
const nodeTypes = { step: StepNode };

function GraphControls({
  onAdd,
  onFit,
  pending,
  readOnly,
}: {
  onAdd: () => void;
  onFit: () => void;
  pending: boolean;
  readOnly: boolean;
}) {
  const { zoomIn, zoomOut } = useReactFlow();
  return (
    <Panel
      position="top-left"
      className="flex items-center gap-1 rounded-xl border border-ui-border bg-surface-raised p-1"
    >
      {!readOnly && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            aria-label="Add step"
            title="Add step"
            disabled={pending}
            onClick={onAdd}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Add step
          </Button>
          <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-ui-border" />
        </>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-text-muted"
        aria-label="Zoom out"
        onClick={() => void zoomOut()}
      >
        <ZoomOut aria-hidden="true" className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-text-muted"
        aria-label="Zoom in"
        onClick={() => void zoomIn()}
      >
        <ZoomIn aria-hidden="true" className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="pointer-coarse:min-h-11"
        title="Fit graph, or focus the selected/start step in a large graph"
        onClick={onFit}
      >
        <Maximize aria-hidden="true" className="size-3.5" />
        Fit
      </Button>
    </Panel>
  );
}

function GraphCanvas({
  readOnly = false,
  proposalChanges,
  focusRequest,
  highlights = [],
  initialPositions,
  onPositionsChange,
  agent,
  selectedTransitionFunction = null,
  selectedNodeId,
  onSelect,
  onSelectTransition,
  onAddStep,
  onDeleteStep,
  onConnectSteps,
  onReconnectStep,
  pending = false,
}: {
  readOnly?: boolean;
  proposalChanges?: ProposalGraphChanges;
  focusRequest?: { node: string; token: number } | null;
  highlights?: GraphReference[];
  initialPositions?: Record<string, XYPosition>;
  onPositionsChange?: (positions: Record<string, XYPosition>) => void;
  selectedTransitionFunction?: string | null;
  onConnectSteps?: (source: string, target: string) => void;
  onReconnectStep?: (source: string, name: string, nextSource: string, target: string) => void;
  onAddStep?: (name: string, source: string | null, end: boolean, condition: string, goal: string) => string;
  onDeleteStep?: (name: string) => void;
  pending?: boolean;
  agent: AgentConfig;
  selectedNodeId: string | null;
  onSelect: (id: string | null) => void;
  onSelectTransition: (source: string, index: number) => void;
}) {
  const { fitView, setViewport, viewportInitialized } = useReactFlow();
  useEffect(() => {
    if (focusRequest) void fitView({ nodes: [{ id: focusRequest.node }], padding: 0.8, maxZoom: 1 });
  }, [focusRequest, fitView]);
  const container = useRef<HTMLDivElement>(null);
  const nodesInitialized = useNodesInitialized();
  const canvasWidth = useStore(state => state.width);
  const canvasHeight = useStore(state => state.height);
  const reconnecting = useRef(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [adding, setAdding] = useState<{
    id: number;
    source: string | null;
    animate: boolean;
    point?: XYPosition;
  } | null>(null);
  const addCount = useRef(0);
  const addTrigger = useRef<HTMLElement | null>(null);
  const closeAdd = () => {
    setAdding(null);
    addTrigger.current?.focus({ preventScroll: true });
  };
  const openAdd = useCallback((source: string | null, point?: XYPosition) => {
    addTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bounds = container.current?.getBoundingClientRect();
    const anchor =
      point ??
      (source
        ? (() => {
            const rect = addTrigger.current?.getBoundingClientRect();
            return rect ? { x: rect.left, y: rect.bottom + 8 } : undefined;
          })()
        : undefined);
    const local =
      bounds && anchor
        ? {
            x: Math.max(16, Math.min(anchor.x - bounds.left, bounds.width - 336)),
            y: Math.max(64, Math.min(anchor.y - bounds.top, bounds.height - 540)),
          }
        : undefined;
    setAdding({
      id: ++addCount.current,
      source,
      animate: !addTrigger.current?.matches(':focus-visible'),
      point: local,
    });
  }, []);
  const graph = useMemo(() => agentGraph(agent), [agent]);
  const topology = graphTopology(agent);
  const [geometry, setGeometry] = useState(() => ({ topology, positions: initialPositions ?? {} }));
  const positions = useMemo(
    () => (geometry.topology === topology ? geometry.positions : {}),
    [geometry, topology],
  );
  if (geometry.topology !== topology) setGeometry({ topology, positions: {} });
  const setPositions = (update: (current: Record<string, XYPosition>) => Record<string, XYPosition>) =>
    setGeometry(current => ({
      topology,
      positions: update(current.topology === topology ? current.positions : {}),
    }));
  useEffect(() => {
    onPositionsChange?.(positions);
  }, [onPositionsChange, positions]);
  const [measurements, setMeasurements] = useState<Record<string, Size>>({});
  const layout = useMemo(
    () => layoutGraph(graph.nodes, graph.edges, measurements, positions),
    [graph, measurements, positions],
  );
  const frameGraph = useCallback(() => {
    const frame = graphViewport(
      layout,
      { width: canvasWidth, height: canvasHeight },
      selectedNodeId,
      agent.initial_node,
    );
    return setViewport(frame.viewport);
  }, [layout, canvasWidth, canvasHeight, selectedNodeId, agent.initial_node, setViewport]);
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    const element = container.current;
    // Hidden mobile panes have fallback dimensions; frame only after real node measurements.
    if (
      fitted.current === topology ||
      !viewportInitialized ||
      !nodesInitialized ||
      !element?.clientWidth ||
      !element.clientHeight
    )
      return;
    if (Math.abs(canvasWidth - element.clientWidth) > 1 || Math.abs(canvasHeight - element.clientHeight) > 1)
      return;
    if (graph.nodes.some(node => !measurements[node.id])) return;
    void frameGraph().then(success => {
      if (success) fitted.current = topology;
    });
  }, [
    topology,
    viewportInitialized,
    nodesInitialized,
    canvasWidth,
    canvasHeight,
    graph,
    measurements,
    frameGraph,
  ]);
  const dropPoint = (event: MouseEvent | TouchEvent) => {
    const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
    return pointer ? { x: pointer.clientX, y: pointer.clientY } : null;
  };
  const dropNode = (point: XYPosition) =>
    document.elementFromPoint(point.x, point.y)?.closest('.react-flow__node')?.getAttribute('data-id');
  const reconnect = (id: string, source: string, nextSource: string, target: string) => {
    const index = graph.edges.filter(item => item.source === source).findIndex(item => item.id === id);
    const transition = agent.nodes.find(node => node.name === source)?.edges[index];
    if (transition && (transition.target !== target || source !== nextSource))
      onReconnectStep?.(source, transition.function, nextSource, target);
  };
  const edges = useMemo(
    () =>
      graph.edges.map(edge => ({
        ...edge,
        selected:
          (edge.source === selectedNodeId && edge.data?.function === selectedTransitionFunction) ||
          highlights.some(
            ref =>
              ref.kind === 'transition' && ref.node === edge.source && ref.function === edge.data?.function,
          ),
        reconnectable: !readOnly && !pending && !!onReconnectStep,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: proposalChanges?.transitions.get(edge.source)?.has(edge.data?.function ?? '')
            ? 'var(--ui-proposal)'
            : undefined,
        },
        data: {
          route: layout.routes[edge.id],
          proposalChange: proposalChanges?.transitions.get(edge.source)?.get(edge.data?.function ?? ''),
          onInspect: () => {
            const index = graph.edges
              .filter(item => item.source === edge.source)
              .findIndex(item => item.id === edge.id);
            onSelectTransition(edge.source, index);
          },
        },
      })),
    [
      layout,
      readOnly,
      proposalChanges,
      highlights,
      graph,
      onSelectTransition,
      onReconnectStep,
      pending,
      selectedNodeId,
      selectedTransitionFunction,
    ],
  );
  const nodes = useMemo(
    () =>
      graph.nodes.map(node => ({
        ...node,
        position: { x: layout.nodes[node.id].x, y: layout.nodes[node.id].y },
        measured: measurements[node.id],
        selected: node.id === selectedNodeId || highlights.some(ref => ref.node === node.id),
        data: {
          ...node.data,
          readOnly,
          proposalChange: proposalChanges?.nodes.get(node.id),
          pending,
          connecting: connecting !== null && connecting !== node.id,
          onAdd: !readOnly && onAddStep ? () => openAdd(node.id) : undefined,
          onDelete:
            !readOnly && onDeleteStep
              ? () => {
                  setAdding(null);
                  onDeleteStep(node.id);
                }
              : undefined,
        },
        ariaRole: 'button' as const,
        ariaLabel: `Inspect ${node.id}`,
        domAttributes: {
          'aria-pressed': node.id === selectedNodeId,
          onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              onSelect(node.id);
            }
          },
        },
      })),
    [
      layout,
      readOnly,
      proposalChanges,
      highlights,
      graph,
      measurements,
      connecting,
      selectedNodeId,
      onSelect,
      onAddStep,
      onDeleteStep,
      pending,
      openAdd,
    ],
  );
  return (
    <div
      ref={container}
      className="relative h-full min-h-80"
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          if (adding) closeAdd();
          else onSelect(null);
        }
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={!pending}
        nodeDragThreshold={5}
        connectOnClick={false}
        onNodesChange={changes => {
          if (changes.some(change => change.type === 'position' && change.dragging !== undefined))
            setPositions(current => {
              const next = { ...current };
              for (const change of changes)
                if (change.type === 'position' && change.dragging !== undefined && change.position)
                  next[change.id] = change.position;
              return next;
            });
          // Controlled nodes must retain React Flow's measured dimensions. Dropping
          // these on rerender resets initialization and makes every node hidden.
          if (changes.some(change => change.type === 'dimensions'))
            setMeasurements(current => {
              const next = { ...current };
              for (const change of changes)
                if (change.type === 'dimensions' && change.dimensions) next[change.id] = change.dimensions;
              return next;
            });
        }}
        nodesConnectable={!readOnly && !pending && !!onConnectSteps}
        edgesFocusable={false}
        deleteKeyCode={null}
        connectionRadius={28}
        reconnectRadius={16}
        onConnect={({ source, target }) => {
          if (!readOnly && !pending) onConnectSteps?.(source, target);
        }}
        onConnectStart={(_, params) => {
          setAdding(null);
          setConnecting(params.nodeId);
        }}
        onConnectEnd={(event, state) => {
          setConnecting(null);
          if (
            readOnly ||
            pending ||
            reconnecting.current ||
            state.isValid ||
            state.fromHandle?.type !== 'source'
          )
            return;
          const point = dropPoint(event);
          if (!point || !state.fromNode) return;
          const target = dropNode(point);
          if (target && target !== state.fromNode.id) onConnectSteps?.(state.fromNode.id, target);
          else if (
            !target &&
            document.elementFromPoint(point.x, point.y)?.classList.contains('react-flow__pane')
          )
            openAdd(state.fromNode.id, point);
        }}
        onReconnectStart={(_, edge) => {
          reconnecting.current = true;
          setConnecting(edge.source);
        }}
        onReconnect={(edge, connection) => {
          if (!readOnly && !pending) reconnect(edge.id, edge.source, connection.source, connection.target);
        }}
        onReconnectEnd={(event, edge, fixedHandleType, state) => {
          reconnecting.current = false;
          setConnecting(null);
          if (readOnly || pending || state.isValid) return;
          const point = dropPoint(event);
          const target = point && dropNode(point);
          // React Flow reports the stationary (opposite) handle here.
          if (target)
            reconnect(
              edge.id,
              edge.source,
              fixedHandleType === 'target' ? target : edge.source,
              fixedHandleType === 'source' ? target : edge.target,
            );
        }}
        onEdgeClick={(_, edge) => edge.data?.onInspect()}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={20} size={0.7} />
        <GraphControls
          onFit={frameGraph}
          readOnly={readOnly}
          onAdd={() => openAdd(null)}
          pending={pending || !onAddStep}
        />
        {!readOnly && adding && (
          <AddStepPanel
            key={adding.id}
            source={adding.source}
            point={adding.point}
            animate={adding.animate}
            pending={pending}
            onSubmit={(name, end, condition, goal) => {
              onAddStep?.(name, adding.source, end, condition, goal);
              setAdding(null);
            }}
            onClose={closeAdd}
          />
        )}
      </ReactFlow>
    </div>
  );
}

export function AgentGraph(props: ComponentProps<typeof GraphCanvas>) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
