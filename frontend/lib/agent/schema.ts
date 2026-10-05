import { z } from 'zod';

// Keep wire names identical to backend/agent_builder/schema.py.
// Pipecat message/action payloads and JSON Schema properties pass through as JSON.
const jsonObject = z.record(z.string(), z.json());

export const edgeSchema = z.object({
  function: z.string(),
  description: z.string(),
  target: z.string(),
  properties: jsonObject.default({}),
  required: z.array(z.string()).default([]),
});

export const nodeSchema = z.object({
  name: z.string(),
  task_messages: z.array(jsonObject).default([]),
  role_message: z.string().nullable().default(null),
  edges: z.array(edgeSchema).default([]),
  pre_actions: z.array(jsonObject).default([]),
  post_actions: z.array(jsonObject).default([]),
  end: z.boolean().default(false),
});

export const agentSchema = z.object({
  name: z.string(),
  initial_node: z.string(),
  nodes: z.array(nodeSchema),
  persona: z.string().default(''),
  voice_id: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  model: z.string().default('gpt-4o'),
});

export type AgentConfig = z.output<typeof agentSchema>;
export type AgentInput = z.input<typeof agentSchema>;
export type AgentNode = z.output<typeof nodeSchema>;
export type AgentEdge = z.output<typeof edgeSchema>;

// These three checks provide local feedback, not proof of runtime validity.
// Python remains authoritative; do not expand this into a second graph validator.
export function parseAgent(input: unknown): AgentConfig {
  const agent = agentSchema.parse(input);
  const names = new Set(agent.nodes.map(node => node.name));
  if (!names.size) throw new Error('Agent has no nodes.');
  if (!names.has(agent.initial_node)) throw new Error(`Unknown initial node: ${agent.initial_node}`);
  for (const node of agent.nodes) {
    for (const edge of node.edges) {
      if (!names.has(edge.target)) throw new Error(`Unknown edge target: ${edge.target}`);
    }
  }
  return agent;
}
