import { z } from 'zod';
import { parseAgent, type AgentConfig } from './schema';

// Extend this union in slice 02. No separate mutation path for manual/AI edits.
export const agentOperationSchema = z.object({
  type: z.literal('update_agent'),
  changes: z.object({
    name: z.string(), persona: z.string(), voice_id: z.string(), model: z.string(),
  }).partial().strict().refine(changes => Object.keys(changes).length > 0, 'Empty patch'),
}).strict();

export type AgentOperation = z.infer<typeof agentOperationSchema>;

// Pure and atomic: validation failure never alters the caller's state.
export function applyAgentOperations(agent: AgentConfig, operations: readonly AgentOperation[]): AgentConfig {
  const parsed = z.array(agentOperationSchema).parse(operations);
  const candidate = parsed.reduce((current, operation) => ({ ...current, ...operation.changes }), agent);
  return parseAgent(candidate);
}
