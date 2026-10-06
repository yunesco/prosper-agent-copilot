import type { AgentConfig } from './schema';
import { edgeSchema, nodeSchema } from './schema';
import type { AgentOperation } from './operations';

/** Canvas gestures use the same atomic draft operations as the inspector. */
export function connectStepOperations(agent: AgentConfig, source: string, target: string): AgentOperation[] {
  if (!agent.nodes.some(node => node.name === target)) throw new Error('Choose an existing target step.');
  return [
    createTransitionOperation(agent, source, target, 'When this step is complete.'),
    { type: 'update_node', node: source, changes: { end: false } },
  ];
}

// Manual connections start with the user's condition. Tool naming is an implementation detail.
export function createTransitionOperation(
  agent: AgentConfig,
  source: string,
  target: string,
  condition: string,
): AgentOperation {
  const nodes = agent.nodes.filter(node => node.name === source);
  if (nodes.length !== 1) throw new Error('Choose an existing source step.');
  if (!condition.trim()) throw new Error('Describe when this transition should happen.');
  const stem = `go_to_${target.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 56);
  const names = new Set(nodes[0].edges.map(edge => edge.function));
  let name = stem;
  let suffix = 2;
  while (names.has(name)) name = `${stem}_${suffix++}`;
  return {
    type: 'add_edge',
    node: source,
    value: edgeSchema.parse({ function: name, description: condition.trim(), target }),
  };
}

export function createStepOperations(
  agent: AgentConfig,
  label: string,
  source: string | null,
  end: boolean,
  condition: string,
  goal: string,
) {
  if (!goal.trim()) throw new Error('Describe what the agent should do in this step.');
  const stem = label.trim().replace(/\s+/g, '_');
  if (!stem) throw new Error('Give the step a name.');
  const names = new Set(agent.nodes.map(node => node.name));
  let nodeId = stem;
  let suffix = 2;
  while (names.has(nodeId)) nodeId = `${stem}_${suffix++}`;
  const operations: AgentOperation[] = [
    {
      type: 'add_node',
      value: nodeSchema.parse({
        name: nodeId,
        end,
        task_messages: [{ role: 'system', content: goal.trim() }],
      }),
    },
  ];
  if (source !== null)
    operations.push(createTransitionOperation(agent, source, nodeId, condition), {
      type: 'update_node',
      node: source,
      changes: { end: false },
    });
  return { nodeId, operations };
}

/** Move either endpoint while retaining the transition's native schema and condition. */
export function reconnectStepOperations(
  agent: AgentConfig,
  source: string,
  name: string,
  nextSource: string,
  target: string,
): AgentOperation[] {
  const sources = agent.nodes.filter(node => node.name === source);
  const destinations = agent.nodes.filter(node => node.name === nextSource);
  const edges = sources.length === 1 ? sources[0].edges.filter(edge => edge.function === name) : [];
  if (edges.length !== 1 || destinations.length !== 1)
    throw new Error('Choose an existing, unambiguous transition and source step.');
  if (agent.nodes.filter(node => node.name === target).length !== 1)
    throw new Error('Choose an existing target step.');
  if (source === nextSource)
    return [{ type: 'update_edge', node: source, function: name, changes: { target } }];
  if (destinations[0].edges.some(edge => edge.function === name))
    throw new Error('That step already has this function name. Rename the function before moving it.');
  return [
    { type: 'delete_edge', node: source, function: name },
    { type: 'add_edge', node: nextSource, value: { ...edges[0], target } },
    { type: 'update_node', node: nextSource, changes: { end: false } },
  ];
}
