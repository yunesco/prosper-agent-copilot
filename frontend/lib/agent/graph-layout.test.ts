import { expect, test } from 'vitest';
import { loadAgentFixture } from '../fixtures';
import { agentGraph, graphTopology } from './graph';
import { graphViewport, layoutGraph, type Rect } from './graph-layout';

const demo = () => loadAgentFixture('clinic-scheduler');
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

for (const scale of [1, 2])
  test(`cards and transition labels are disjoint at ${scale}x text`, () => {
    const agent = demo();
    const before = structuredClone(agent);
    const graph = agentGraph(agent);
    const sizes = Object.fromEntries(
      graph.nodes.map(node => [node.id, { width: 288 * scale, height: 160 * scale }]),
    );
    const layout = layoutGraph(graph.nodes, graph.edges, sizes);
    const cards = Object.values(layout.nodes),
      badges = Object.values(layout.routes).map(route => route.label);
    cards.forEach((a, i) => cards.slice(i + 1).forEach(b => expect(overlaps(a, b)).toBe(false)));
    badges.forEach((a, i) => {
      badges.slice(i + 1).forEach(b => expect(overlaps(a, b)).toBe(false));
      cards.forEach(b => expect(overlaps(a, b)).toBe(false));
    });
    expect(agent).toEqual(before);
  });

test('explicit user positions are preserved', () => {
  const graph = agentGraph(demo());
  const pinned = { offer_times: { x: -360, y: 420 } };
  const layout = layoutGraph(graph.nodes, graph.edges, {}, pinned);
  expect(layout.nodes.offer_times).toMatchObject(pinned.offer_times);
});

test('Fit frames a small graph entirely', () => {
  const small = agentGraph(demo());
  const layout = layoutGraph(small.nodes, small.edges);
  expect(graphViewport(layout, { width: 1000, height: 1000 }, null, small.nodes[0].id).focused).toBe(false);
});

// Regression for the reported detour: proximity is not a reason to route outside.
test('moving forward steps close together keeps a direct connection', () => {
  const graph = agentGraph(demo());
  const positions = { collect_details: { x: 80, y: 0 }, offer_times: { x: 0, y: 180 } };
  const layout = layoutGraph(graph.nodes, graph.edges, {}, positions);
  expect(layout.routes[graph.edges[0].id].returnX).toBeUndefined();
  expect(layout.routes[graph.edges[0].id].centerY).toBeUndefined();
});

test('a shortcut condition stays with its source, clear of intermediate steps', () => {
  const agent = demo();
  const before = agentGraph(agent);
  agent.nodes[0].edges.push({
    function: 'finish_early',
    description: 'Finish early',
    target: agent.nodes.at(-1)!.name,
    properties: {},
    required: [],
  });
  const graph = agentGraph(agent);
  const nodes = graph.nodes.map(node => ({
    ...node,
    data: { ...node.data, depth: before.nodes.find(previous => previous.id === node.id)!.data.depth },
  }));
  const layout = layoutGraph(nodes, graph.edges);
  const shortcut = graph.edges.find(edge => edge.data?.function === 'finish_early')!;
  expect(layout.routes[shortcut.id].label.y + layout.routes[shortcut.id].label.height).toBeLessThan(
    layout.nodes[agent.nodes[1].name].y,
  );
});

test('fresh ranks keep shortcuts below prerequisites and recalculate changed paths', () => {
  const agent = demo();
  agent.nodes[0].edges.unshift({ ...agent.nodes[0].edges[0], function: 'shortcut', target: 'confirm' });
  const before = structuredClone(agent);
  const graph = agentGraph(agent);
  const layout = layoutGraph(graph.nodes, graph.edges);
  expect(layout.nodes.confirm.y).toBeGreaterThan(layout.nodes.offer_times.y);
  agent.nodes[0].edges = agent.nodes[0].edges.filter(edge => edge.target === 'confirm');
  agent.nodes.find(node => node.name === 'confirm')!.edges = [
    { ...agent.nodes[0].edges[0], target: 'offer_times' },
  ];
  agent.nodes.find(node => node.name === 'offer_times')!.edges = [];
  const reranked = agentGraph(agent);
  const next = layoutGraph(reranked.nodes, reranked.edges);
  expect(next.nodes.offer_times.y).toBeGreaterThan(next.nodes.confirm.y);
  expect(before.nodes[0].edges).toHaveLength(2);
});

test('only structural edits invalidate dragged positions', () => {
  const agent = demo();
  const topology = graphTopology(agent);
  agent.nodes[0].task_messages = [{ role: 'system', content: 'New instructions' }];
  agent.nodes[0].edges[0].description = 'New condition text';
  expect(graphTopology(agent)).toBe(topology);
  agent.nodes[0].edges[0].target = 'confirm';
  expect(graphTopology(agent)).not.toBe(topology);
});
