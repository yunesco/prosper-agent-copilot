import type { Edge, XYPosition } from '@xyflow/react';
import type { StepNode } from './graph';

export type Size = { width: number; height: number };
export type Rect = XYPosition & Size;
export type EdgeRoute = { label: Rect; centerX?: number; centerY?: number; returnX?: number };
export type GraphLayout = { nodes: Record<string, Rect>; routes: Record<string, EdgeRoute>; bounds: Rect };
const union = (rects: Rect[]): Rect => {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...rects.map(r => r.x)),
    y = Math.min(...rects.map(r => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map(r => r.x + r.width)) - x,
    height: Math.max(...rects.map(r => r.y + r.height)) - y,
  };
};

/** Measured presentation geometry only. Explicit user positions always win. */
export function layoutGraph(
  nodes: StepNode[],
  edges: Edge[],
  sizes: Record<string, Size> = {},
  pinned: Record<string, XYPosition> = {},
): GraphLayout {
  const scale = Math.max(1, ...Object.values(sizes).map(size => size.width / 288));
  const gap = 12 * scale,
    clearance = 24 * scale;
  const nodeSize = (id: string) => sizes[id] ?? { width: 288 * scale, height: 132 * scale };
  // The edge button is at most 15rem wide and 2.75rem tall (touch target).
  const labelSize = { width: 240 * scale, height: 44 * scale };
  const rows = new Map<number, StepNode[]>();
  for (const node of nodes) {
    const row = rows.get(node.data.depth) ?? [];
    row.push(node);
    rows.set(node.data.depth, row);
  }
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    const group = outgoing.get(edge.source) ?? [];
    group.push(edge);
    outgoing.set(edge.source, group);
  }
  const rects: Record<string, Rect> = {};
  let y = 0;
  for (const [, row] of [...rows].sort(([a], [b]) => a - b)) {
    let x = 0;
    for (const node of row) {
      const size = nodeSize(node.id);
      rects[node.id] = { ...size, ...(pinned[node.id] ?? { x, y }) };
      x += size.width + 120 * scale;
    }
    const laneSpace = Math.max(
      0,
      ...row.map(node => (outgoing.get(node.id) ?? []).reduce(sum => sum + labelSize.height + gap, 0)),
    );
    y +=
      Math.max(...row.map(node => nodeSize(node.id).height)) +
      Math.max(96 * scale, laneSpace + clearance * 2);
  }
  const obstacles = Object.values(rects);
  const routes: Record<string, EdgeRoute> = {};
  const incoming = new Map<string, Edge[]>();
  for (const edge of edges) {
    const group = incoming.get(edge.target) ?? [];
    group.push(edge);
    incoming.set(edge.target, group);
  }
  let returnLane = 0;
  for (const edge of edges) {
    const source = rects[edge.source],
      target = rects[edge.target];
    if (!source || !target) continue;
    const siblings = outgoing.get(edge.source)!;
    const targets = incoming.get(edge.target)!;
    const index = siblings.indexOf(edge);
    const sx = source.x + (source.width * (index + 1)) / (siblings.length + 2);
    const tx = target.x + (target.width * (targets.indexOf(edge) + 1)) / (targets.length + 1);
    const middleY = (source.y + source.height + target.y) / 2;
    if (target.y <= source.y) {
      // Only actual return links take a side lane. Moving ordinary cards closer
      // must never send their connections on a tour around the entire graph.
      const between = obstacles.filter(rect => rect.y <= source.y && rect.y + rect.height >= target.y);
      const returnX =
        Math.max(...between.map(rect => rect.x + rect.width)) +
        clearance +
        labelSize.width / 2 +
        returnLane++ * (labelSize.width + gap);
      routes[edge.id] = {
        returnX,
        label: { ...labelSize, x: returnX - labelSize.width / 2, y: middleY - labelSize.height / 2 },
      };
    } else {
      const centerY =
        siblings.length > 1
          ? source.y + source.height + clearance + labelSize.height / 2 + index * (labelSize.height + gap)
          : middleY;
      const centerX = siblings.length > 1 ? source.x + source.width / 2 : (sx + tx) / 2;
      routes[edge.id] = {
        ...(siblings.length > 1 ? { centerX, centerY } : {}),
        label: { ...labelSize, x: centerX - labelSize.width / 2, y: centerY - labelSize.height / 2 },
      };
    }
  }
  const routeBounds = Object.values(routes).map(route => route.label);
  // Include the start badge and handles in framing.
  return {
    nodes: rects,
    routes,
    bounds: union([
      ...obstacles,
      ...routeBounds,
      ...nodes
        .filter(node => node.data.initial)
        .map(node => ({ ...rects[node.id], y: rects[node.id].y - 48 * scale, height: 48 * scale })),
    ]),
  };
}

/** Do not strand users halfway along a huge graph at minimum zoom. */
export function graphViewport(layout: GraphLayout, viewport: Size, focus: string | null, start: string) {
  const available = { width: Math.max(1, viewport.width - 64), height: Math.max(1, viewport.height - 128) };
  const zoomFor = (rect: Rect) =>
    Math.min(1, available.width / Math.max(1, rect.width), available.height / Math.max(1, rect.height));
  const focused = zoomFor(layout.bounds) < 0.6;
  const bounds = focused
    ? (layout.nodes[focus ?? ''] ?? layout.nodes[start] ?? layout.bounds)
    : layout.bounds;
  const zoom = Math.max(0.2, zoomFor(bounds));
  return {
    focused,
    viewport: {
      x: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y:
        focused && !focus
          ? Math.min(viewport.height / 3, (96 * bounds.width) / 288) - bounds.y * zoom
          : viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
      zoom,
    },
  };
}
