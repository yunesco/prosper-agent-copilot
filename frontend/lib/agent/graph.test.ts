import { expect, test } from 'vitest';
import { loadAgentFixture } from '../fixtures';
import { agentGraph } from './graph';

test('maps every runtime node and transition without changing runtime data', () => {
  const agent = loadAgentFixture('original-scheduler');
  const before = structuredClone(agent);
  const graph = agentGraph(agent);
  expect(graph.nodes.map(node => node.id)).toEqual(agent.nodes.map(node => node.name));
  expect(graph.nodes.find(node => node.id === 'greeting')?.data.initial).toBe(true);
  expect(graph.nodes.find(node => node.id === 'confirm')?.data.terminal).toBe(true);
  expect(graph.edges).toHaveLength(3);
  expect(graph.edges[1]).toMatchObject({
    source: 'collect_details',
    target: 'offer_times',
    label: agent.nodes[1].edges[0].description,
  });
  graph.nodes[0].position.x = 999;
  expect(agent).toEqual(before);
});

test('branches, parallel edges, cycles and disconnected nodes retain unique stable identities', () => {
  const agent = loadAgentFixture('original-scheduler');
  agent.nodes[0].edges.push({ ...agent.nodes[0].edges[0], target: 'offer_times' });
  agent.nodes[2].edges[0].target = 'greeting';
  const graph = agentGraph(agent);
  expect(new Set(graph.edges.map(edge => edge.id)).size).toBe(4);
  expect(new Set(graph.nodes.map(node => JSON.stringify(node.position))).size).toBe(4);
  agent.nodes.reverse();
  expect(
    agentGraph(agent)
      .edges.map(edge => edge.id)
      .sort(),
  ).toEqual(graph.edges.map(edge => edge.id).sort());
});

test('node previews use native text blocks with a clear fallback, without modifying messages', () => {
  const agent = loadAgentFixture('original-scheduler');
  agent.nodes[0].task_messages = [
    {
      content: [
        { type: 'text', text: 'First instruction.' },
        { type: 'image', url: 'synthetic' },
      ],
    },
    { content: 'Second instruction.' },
  ];
  agent.nodes[1].task_messages = [{ content: [{ type: 'image', url: 'synthetic' }] }];
  const before = structuredClone(agent);
  const { nodes } = agentGraph(agent);
  expect(nodes[0].data.description).toBe('First instruction. Second instruction.');
  expect(nodes[1].data.description).toBe('No text instructions. Select to inspect this step.');
  expect(agent).toEqual(before);
});

test('converging transitions have separately addressed target handles', () => {
  const agent = loadAgentFixture('original-scheduler');
  agent.nodes[0].edges.push({ ...agent.nodes[0].edges[0], function: 'finish_early', target: 'confirm' });
  const before = structuredClone(agent);
  const graph = agentGraph(agent);
  const incoming = graph.edges.filter(edge => edge.target === 'confirm');
  expect(new Set(incoming.map(edge => edge.targetHandle)).size).toBe(2);
  expect(graph.nodes.find(node => node.id === 'confirm')?.data.incoming.map(item => item.id)).toEqual(
    incoming.map(edge => edge.targetHandle),
  );
  expect(agent).toEqual(before);
});
