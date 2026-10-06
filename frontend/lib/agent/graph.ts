import type { Edge, Node } from '@xyflow/react';
import type { AgentConfig, AgentNode } from './schema';
import type { ProposalGraphChange } from './proposal-graph';

export type StepData = {
  depth: number;
  readOnly?: boolean;
  proposalChange?: ProposalGraphChange;
  label: string;
  initial: boolean;
  terminal: boolean;
  endsConversation: boolean;
  description: string;
  outgoing: { id: string }[];
  incoming: { id: string; source: string }[];
  onAdd?: () => void;
  onDelete?: () => void;
  connecting?: boolean;
  pending?: boolean;
};
export type StepNode = Node<StepData, 'step'>;
export const stepTitle = (name: string) =>
  name.replaceAll('_', ' ').replace(/^./, char => char.toUpperCase());
// React Flow interpolates handle IDs into quoted CSS selectors without escaping.
// Encode the tuple at this presentation boundary; runtime addresses stay native.
const connectionId = (source: string, name: string, index: number) =>
  encodeURIComponent(JSON.stringify([source, name, index]));

export function nodeDescription(node: AgentNode): string {
  const text = node.task_messages
    .flatMap(message => {
      if (typeof message.content === 'string') return [message.content];
      if (Array.isArray(message.content))
        return message.content.flatMap(part =>
          part && typeof part === 'object' && !Array.isArray(part) && typeof part.text === 'string'
            ? [part.text]
            : [],
        );
      return [];
    })
    .filter(text => text.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || 'No text instructions. Select to inspect this step.';
}

/** Presentation only. Runtime objects are neither mutated nor embedded in graph state. */
export function agentGraph(agent: AgentConfig): { nodes: StepNode[]; edges: Edge<{ function: string }>[] } {
  const byName = new Map(agent.nodes.map(node => [node.name, node]));
  const incoming = new Map<string, { id: string; source: string }[]>();
  for (const node of agent.nodes)
    node.edges.forEach((edge, index) => {
      const handles = incoming.get(edge.target) ?? [];
      handles.push({ id: connectionId(node.name, edge.function, index), source: node.name });
      incoming.set(edge.target, handles);
    });
  // Rank by the longest forward path, so shortcuts do not pull a later step
  // above its prerequisites. DFS back-links remain explicit return routes.
  const visited = new Set<string>();
  const order: string[] = [];
  for (const root of [agent.initial_node, ...agent.nodes.map(node => node.name)]) {
    if (visited.has(root) || !byName.has(root)) continue;
    const stack = [{ name: root, next: 0 }];
    visited.add(root);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edges = byName.get(frame.name)!.edges;
      if (frame.next === edges.length) {
        order.push(frame.name);
        stack.pop();
        continue;
      }
      const target = edges[frame.next++].target;
      if (!visited.has(target) && byName.has(target)) {
        visited.add(target);
        stack.push({ name: target, next: 0 });
      }
    }
  }
  order.reverse();
  const rank = new Map(order.map((name, index) => [name, index]));
  const depths = new Map<string, number>();
  for (const source of order) {
    const depth = depths.get(source) ?? 0;
    depths.set(source, depth);
    for (const edge of byName.get(source)!.edges) {
      if ((rank.get(edge.target) ?? -1) > rank.get(source)!)
        depths.set(edge.target, Math.max(depths.get(edge.target) ?? 0, depth + 1));
    }
  }
  const rows = new Map<number, number>();
  return {
    nodes: agent.nodes.map(node => {
      const depth = depths.get(node.name) ?? depths.size;
      const column = rows.get(depth) ?? 0;
      rows.set(depth, column + 1);
      return {
        id: node.name,
        type: 'step',
        position: { x: column * 410, y: depth * 225 },
        data: {
          depth,
          label: node.name,
          initial: node.name === agent.initial_node,
          terminal: node.end,
          endsConversation: node.end && node.post_actions.length === 0,
          description: nodeDescription(node),
          outgoing: node.edges.map((edge, index) => ({ id: connectionId(node.name, edge.function, index) })),
          incoming: incoming.get(node.name) ?? [],
        },
      };
    }),
    edges: agent.nodes.flatMap(node =>
      node.edges.map((edge, index) => ({
        id: connectionId(node.name, edge.function, index),
        source: node.name,
        target: edge.target,
        sourceHandle: connectionId(node.name, edge.function, index),
        targetHandle: connectionId(node.name, edge.function, index),
        data: { function: edge.function },
        label: edge.description.trim() || 'Set condition',
        type: 'condition',
      })),
    ),
  };
}

/** Geometry invalidation excludes text, selection and runtime-only settings. */
export function graphTopology(agent: AgentConfig): string {
  return JSON.stringify([
    agent.initial_node,
    agent.nodes.map(node => [node.name, node.edges.map(edge => [edge.function, edge.target])]),
  ]);
}
