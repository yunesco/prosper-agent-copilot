'use client';

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import { ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ConditionEdge(props: EdgeProps<Edge<{ onInspect: () => void }>>) {
  const [path, x, y] = getBezierPath(props);
  return <>
    <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} />
    <circle cx={props.sourceX} cy={props.sourceY + 16} r={5} className="pointer-events-none fill-surface-raised stroke-text-subtle stroke-1" />
    <circle cx={props.targetX} cy={props.targetY - 16} r={5} className="pointer-events-none fill-surface-raised stroke-text-subtle stroke-1" />
    <EdgeLabelRenderer><Button size="sm" onClick={props.data?.onInspect} aria-label={`Inspect transition: ${props.label}`} title={typeof props.label === 'string' ? props.label : undefined} style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
      className="nodrag nopan pointer-events-auto absolute flex h-auto max-w-60 items-center gap-1.5 rounded-full bg-foreground hover:bg-foreground/85 px-2.5 py-1.5 text-xs pointer-coarse:min-h-11 text-background shadow-sm transition-colors">
      <ArrowDown className="size-3 shrink-0" /><span className="truncate">{props.label}</span>
    </Button></EdgeLabelRenderer>
  </>;
}
