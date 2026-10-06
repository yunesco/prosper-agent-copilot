import { z } from 'zod';
import { agentSchema, edgeSchema, nodeSchema, parseAgent, type AgentConfig } from './schema';

const nonempty = (changes: object) => Object.keys(changes).length > 0;
export const agentOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update_agent'), changes: z.object({
    name: z.string(), persona: z.string(), initial_node: z.string(),
  }).partial().strict().refine(nonempty, 'Empty patch') }).strict(),
  z.object({ type: z.literal('add_node'), value: nodeSchema }).strict(),
  z.object({ type: z.literal('delete_node'), node: z.string() }).strict(),
  z.object({ type: z.literal('update_node'), node: z.string(), changes: z.object({
    task_messages: nodeSchema.shape.task_messages.removeDefault(), role_message: nodeSchema.shape.role_message.removeDefault(), end: z.boolean(),
  }).partial().strict().refine(nonempty, 'Empty patch') }).strict(),
  z.object({ type: z.literal('add_edge'), node: z.string(), value: edgeSchema }).strict(),
  z.object({ type: z.literal('delete_edge'), node: z.string(), function: z.string() }).strict(),
  z.object({ type: z.literal('update_edge'), node: z.string(), function: z.string(),
    changes: z.object({ function: z.string(), description: z.string(), target: z.string(), properties: edgeSchema.shape.properties.removeDefault(), required: edgeSchema.shape.required.removeDefault() }).partial().strict().refine(nonempty, 'Empty patch'),
  }).strict(),
]);
export type AgentOperation = z.infer<typeof agentOperationSchema>;

// Drafts may temporarily contain dangling references. Addresses must always be unique.
export function stageAgentOperations(agent: AgentConfig, operations: readonly AgentOperation[]): AgentConfig {
  let candidate = agent;
  for (const operation of z.array(agentOperationSchema).parse(operations)) {
    if (operation.type === 'update_agent') candidate = { ...candidate, ...operation.changes };
    else if (operation.type === 'add_node') {
      if (candidate.nodes.some(node => node.name === operation.value.name)) throw new Error('Step name already exists.');
      candidate = { ...candidate, nodes: [...candidate.nodes, operation.value] };
    } else {
      const matches = candidate.nodes.filter(node => node.name === operation.node);
      if (matches.length !== 1) throw new Error(`Node must identify exactly one step: ${operation.node}`);
      const source = matches[0];
      if (operation.type === 'delete_node') {
        candidate = { ...candidate, nodes: candidate.nodes.filter(node => node !== source) };
        continue;
      }
      if ((operation.type === 'update_edge' || operation.type === 'delete_edge') && source.edges.filter(edge => edge.function === operation.function).length !== 1) throw new Error('Function must identify exactly one transition.');
      const newFunction = operation.type === 'add_edge' ? operation.value.function : operation.type === 'update_edge' ? operation.changes.function : undefined;
      if (newFunction !== undefined && source.edges.some(edge => edge.function === newFunction && (operation.type !== 'update_edge' || edge.function !== operation.function))) throw new Error('Function name already exists in this step.');
      candidate = { ...candidate, nodes: candidate.nodes.map(node => node !== source ? node :
        operation.type === 'update_node' ? { ...node, ...operation.changes } : {
          ...node, edges: operation.type === 'add_edge' ? [...node.edges, operation.value] : operation.type === 'delete_edge' ? node.edges.filter(edge => edge.function !== operation.function) : node.edges.map(edge => edge.function === operation.function ? { ...edge, ...operation.changes } : edge),
        }) };
    }
  }
  return agentSchema.parse(candidate);
}

// Check references only after the full atomic batch, then validate in Python before commit.
export function applyAgentOperations(agent: AgentConfig, operations: readonly AgentOperation[]): AgentConfig {
  return parseAgent(stageAgentOperations(agent, operations));
}
