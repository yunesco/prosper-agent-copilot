import { expect, test } from 'vitest';
import { readdirSync } from 'node:fs';
import { agentFixtures, loadAgentFixture, loadDemoContext, type AgentFixtureId } from './fixtures';

test('loads independent fixtures and resolves every call, guideline and issue reference', () => {
  for (const id of Object.keys(agentFixtures) as AgentFixtureId[]) expect(loadAgentFixture(id).nodes.length).toBeGreaterThan(0);
  const { calls, guidelines, issues } = loadDemoContext();
  for (const call of calls) {
    expect(Object.keys(agentFixtures)).toContain(call.agent_id);
    const agent = loadAgentFixture(call.agent_id as AgentFixtureId);
    expect(call.graph_path[0], call.id).toBe(agent.initial_node);
    for (const [index, name] of call.graph_path.entries()) {
      const node = agent.nodes.find(node => node.name === name);
      expect(node, `${call.id}: missing node ${name}`).toBeDefined();
      const next = call.graph_path[index + 1];
      if (next) expect(node?.edges.map(edge => edge.target), `${call.id}: ${name} → ${next}`).toContain(next);
    }
    expect(call.transcript.length, call.id).toBeGreaterThan(0);
  }
  for (const guideline of guidelines) expect(Object.keys(agentFixtures)).toContain(guideline.agent_id);
  for (const issue of issues) {
    const call = calls.find(call => call.id === issue.call_id);
    expect(call).toBeDefined();
    expect(call?.graph_path).toContain(issue.node_name);
    expect(guidelines.find(guideline => guideline.id === issue.guideline_id)?.agent_id).toBe(call?.agent_id);
  }
  calls[0].transcript[0].text = 'changed';
  expect(loadDemoContext().calls[0].transcript[0].text).not.toBe('changed');
});

test('every fixture is registered exactly once with a unique filename-matching ID', () => {
  const context = loadDemoContext();
  const registries = {
    agents: Object.keys(agentFixtures).filter(id => id !== 'original-scheduler'),
    calls: context.calls.map(item => item.id),
    guidelines: context.guidelines.map(item => item.id),
    issues: context.issues.map(item => item.id),
  };
  for (const [directory, ids] of Object.entries(registries)) {
    const files = readdirSync(new URL(`../../fixtures/${directory}/`, import.meta.url))
      .filter(file => file.endsWith('.json')).map(file => file.slice(0, -5)).sort();
    expect([...ids].sort(), directory).toEqual(files);
    expect(new Set(ids).size, directory).toBe(ids.length);
  }
});
