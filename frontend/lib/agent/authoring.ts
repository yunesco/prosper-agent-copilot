import type { AgentConfig } from './schema';
import { edgeSchema, nodeSchema } from './schema';
import type { AgentOperation } from './operations';

// Manual connections start with the user's condition. Tool naming is an implementation detail.
export function createTransitionOperation(agent: AgentConfig, source: string, target: string, condition: string): AgentOperation {
  const nodes = agent.nodes.filter(node => node.name === source);
  if (nodes.length !== 1) throw new Error('Choose an existing source step.');
  if (!condition.trim()) throw new Error('Describe when this transition should happen.');
  const stem = `go_to_${target.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 56);
  const names = new Set(nodes[0].edges.map(edge => edge.function));
  let name = stem;
  let suffix = 2;
  while (names.has(name)) name = `${stem}_${suffix++}`;
  return { type: 'add_edge', node: source, value: edgeSchema.parse({ function: name, description: condition.trim(), target }) };
}

export function createStepOperations(agent: AgentConfig, label: string, source: string | null, end: boolean, condition: string, goal: string) {
  if (!goal.trim()) throw new Error('Describe what the agent should do in this step.');
  const stem = label.trim().replace(/\s+/g, '_');
  if (!stem) throw new Error('Give the step a name.');
  const names = new Set(agent.nodes.map(node => node.name));
  let nodeId = stem;
  let suffix = 2;
  while (names.has(nodeId)) nodeId = `${stem}_${suffix++}`;
  const operations: AgentOperation[] = [{ type: 'add_node', value: nodeSchema.parse({ name: nodeId, end, task_messages: [{ role: 'system', content: goal.trim() }] }) }];
  if (source !== null) operations.push(createTransitionOperation(agent, source, nodeId, condition), { type: 'update_node', node: source, changes: { end: false } });
  return { nodeId, operations };
}
