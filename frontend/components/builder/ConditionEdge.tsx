'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { ArrowDown, CornerLeftUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { type EdgeRoute } from '@/lib/agent/graph-layout';
import type { ProposalGraphChange } from '@/lib/agent/proposal-graph';
import { cn } from '@/lib/utils';

export function ConditionEdge(
  props: EdgeProps<Edge<{ onInspect: () => void; route: EdgeRoute; proposalChange?: ProposalGraphChange }>>,
) {
  const route = props.data?.route;
  if (!route) return null;
  const [path, x, y] =
    route.returnX !== undefined
      ? getSmoothStepPath({ ...props, centerX: route.returnX, borderRadius: 12 })
      : route.centerY !== undefined
        ? getSmoothStepPath({
            ...props,
            centerX: route.centerX,
            centerY: route.centerY,
            borderRadius: 12,
            offset: 8,
          })
        : getBezierPath(props);
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        className={props.data?.proposalChange ? '!stroke-proposal' : undefined}
      />
      <circle
        cx={props.sourceX}
        cy={props.sourceY + 16}
        r={3}
        className="pointer-events-none fill-surface-raised stroke-ui-border-strong stroke-1"
      />
      <circle
        cx={props.targetX}
        cy={props.targetY - 16}
        r={3}
        className="pointer-events-none fill-surface-raised stroke-ui-border-strong stroke-1"
      />
      <EdgeLabelRenderer>
        <Button
          data-graph-label={props.id}
          size="sm"
          onClick={props.data?.onInspect}
          aria-pressed={!!props.selected}
          aria-label={`Inspect transition: ${props.label}`}
          title={typeof props.label === 'string' ? props.label : undefined}
          style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
          className={cn(
            'nodrag nopan pointer-events-auto absolute flex h-8 max-w-60 items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-xs font-normal text-background transition-colors hover:bg-foreground/85 pointer-coarse:h-11',
            props.data?.proposalChange && 'bg-proposal text-white hover:bg-proposal/90',
            props.selected && 'outline-2 outline-offset-2 outline-text-muted',
          )}
        >
          {props.targetY < props.sourceY ? (
            <CornerLeftUp aria-hidden="true" className="size-3 shrink-0" />
          ) : (
            <ArrowDown aria-hidden="true" className="size-3 shrink-0" />
          )}
          {props.data?.proposalChange && (
            <span className="shrink-0 font-medium">
              {props.data.proposalChange === 'added' ? 'New' : 'Updated'} ·
            </span>
          )}
          <span className="truncate">{props.label}</span>
        </Button>
      </EdgeLabelRenderer>
    </>
  );
}
