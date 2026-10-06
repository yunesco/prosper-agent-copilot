import type { AgentConfig, AgentNode } from './schema';
import { exact } from './proposals';

export type ProposalGraphChange = 'added' | 'changed';
export type ProposalGraphChanges = {
  nodes: ReadonlyMap<string, ProposalGraphChange>;
  transitions: ReadonlyMap<string, ReadonlyMap<string, ProposalGraphChange>>;
};

const nodeContent = (node: AgentNode) => ({
  ...node,
  edges: [...node.edges].sort((a, b) => a.function.localeCompare(b.function)),
});

/** Candidate-only markings. Removed elements remain in the reviewed diff, not the canvas. */
export function proposalGraphChanges(before: AgentConfig, after: AgentConfig): ProposalGraphChanges {
  const previous = new Map(before.nodes.map(node => [node.name, node]));
  const nodes = new Map<string, ProposalGraphChange>();
  const transitions = new Map<string, ReadonlyMap<string, ProposalGraphChange>>();
  for (const node of after.nodes) {
    const prior = previous.get(node.name);
    if (!prior) nodes.set(node.name, 'added');
    else if (
      exact(nodeContent(prior)) !== exact(nodeContent(node)) ||
      (before.initial_node === node.name) !== (after.initial_node === node.name)
    )
      nodes.set(node.name, 'changed');
    const priorEdges = new Map(prior?.edges.map(edge => [edge.function, edge]));
    const edges = new Map<string, ProposalGraphChange>();
    for (const edge of node.edges) {
      const priorEdge = priorEdges.get(edge.function);
      if (!priorEdge) edges.set(edge.function, 'added');
      else if (exact(priorEdge) !== exact(edge)) edges.set(edge.function, 'changed');
    }
    if (edges.size) transitions.set(node.name, edges);
  }
  return { nodes, transitions };
}
