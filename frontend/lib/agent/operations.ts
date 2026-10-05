import { z } from 'zod';
import { nodeSchema, parseAgent, type AgentConfig } from './schema';

const nonempty = (changes: object) => Object.keys(changes).length > 0;
export const agentOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update_agent'), changes: z.object({
    name: z.string(), persona: z.string(), voice_id: z.string(), model: z.string(),
  }).partial().strict().refine(nonempty, 'Empty patch') }).strict(),
  z.object({ type: z.literal('update_node'), node: z.string(), changes: z.object({
    task_messages: nodeSchema.shape.task_messages.removeDefault(), role_message: nodeSchema.shape.role_message.removeDefault(),
  }).partial().strict().refine(nonempty, 'Empty patch') }).strict(),
  z.object({ type: z.literal('update_edge'), node: z.string(), edge_index: z.number().int().nonnegative(),
    changes: z.object({ description: z.string(), target: z.string() }).partial().strict().refine(nonempty, 'Empty patch'),
  }).strict(),
]);
export type AgentOperation = z.infer<typeof agentOperationSchema>;

// Validate the completed batch, never intermediate graphs or the caller's state.
export function applyAgentOperations(agent: AgentConfig, operations: readonly AgentOperation[]): AgentConfig {
  let candidate = agent;
  for (const operation of z.array(agentOperationSchema).parse(operations)) {
    if (operation.type === 'update_agent') candidate = { ...candidate, ...operation.changes };
    else {
      const matches = candidate.nodes.filter(node => node.name === operation.node);
      if (matches.length !== 1) throw new Error(`Node must identify exactly one step: ${operation.node}`);
      const source = matches[0];
      if (operation.type === 'update_edge' && !source.edges[operation.edge_index]) throw new Error('Unknown transition.');
      candidate = { ...candidate, nodes: candidate.nodes.map(node => node !== source ? node :
        operation.type === 'update_node' ? { ...node, ...operation.changes } : {
          ...node, edges: node.edges.map((edge, index) => index === operation.edge_index ? { ...edge, ...operation.changes } : edge),
        }) };
    }
  }
  return parseAgent(candidate);
}
