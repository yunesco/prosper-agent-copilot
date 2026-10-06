import type { Edge, Node } from '@xyflow/react';
import type { AgentConfig, AgentNode } from './schema';

export type StepData = { label: string; initial: boolean; terminal: boolean; endsConversation: boolean; description: string; onAdd?: () => void; onDelete?: () => void; pending?: boolean };
export type StepNode = Node<StepData, 'step'>;
export const stepTitle = (name: string) => name.replaceAll('_', ' ').replace(/^./, char => char.toUpperCase());

export function nodeDescription(node: AgentNode): string {
  const text = node.task_messages.flatMap(message => {
    if (typeof message.content === 'string') return [message.content];
    if (Array.isArray(message.content)) return message.content.flatMap(part =>
      part && typeof part === 'object' && !Array.isArray(part) && typeof part.text === 'string' ? [part.text] : []);
    return [];
  }).filter(text => text.trim()).join(' ').replace(/\s+/g, ' ').trim();
  return text || 'No text instructions. Select to inspect this step.';
}

/** Presentation only. Runtime objects are neither mutated nor embedded in graph state. */
export function agentGraph(agent: AgentConfig): { nodes: StepNode[]; edges: Edge[] } {
  const depths = new Map<string, number>([[agent.initial_node, 0]]);
  const queue = [agent.initial_node];
  for (let i = 0; i < queue.length; i++) {
    const source = queue[i];
    for (const edge of agent.nodes.find(node => node.name === source)?.edges ?? []) {
      if (!depths.has(edge.target)) {
        depths.set(edge.target, (depths.get(source) ?? 0) + 1);
        queue.push(edge.target);
      }
    }
  }
  const rows = new Map<number, number>();
  return {
    nodes: agent.nodes.map(node => {
      const depth = depths.get(node.name) ?? depths.size;
      const column = rows.get(depth) ?? 0;
      rows.set(depth, column + 1);
      return { id: node.name, type: 'step', position: { x: column * 410, y: depth * 225 },
        data: { label: node.name, initial: node.name === agent.initial_node, terminal: node.end, endsConversation: node.end && node.post_actions.length === 0, description: nodeDescription(node) } };
    }),
    edges: agent.nodes.flatMap(node => node.edges.map((edge, index) => ({
      id: JSON.stringify([node.name, edge.function, index]), source: node.name, target: edge.target,
      label: edge.description.trim() || 'Set condition', type: 'condition',
    }))),
  };
}
