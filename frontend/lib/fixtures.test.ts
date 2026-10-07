import { expect, test } from 'vitest';
import { readdirSync } from 'node:fs';
import {
  agentFixtures,
  callsForAgent,
  loadAgentFixture,
  loadDemoContext,
  loadRiversideDemo,
  type AgentFixtureId,
} from './fixtures';

test('loads independent fixtures and resolves every call, guideline and issue reference', () => {
  for (const id of Object.keys(agentFixtures) as AgentFixtureId[])
    expect(loadAgentFixture(id).nodes.length).toBeGreaterThan(0);
  const { calls, guidelines, issues } = loadDemoContext();
  for (const call of calls) {
    expect(Object.keys(agentFixtures)).toContain(call.agent_id);
    const agent = loadAgentFixture(call.agent_id as AgentFixtureId);
    expect(call.graph_path[0], call.id).toBe(agent.initial_node);
    for (const [index, name] of call.graph_path.entries()) {
      const node = agent.nodes.find(node => node.name === name);
      expect(node, `${call.id}: missing node ${name}`).toBeDefined();
      const next = call.graph_path[index + 1];
      if (next)
        expect(
          node?.edges.map(edge => edge.target),
          `${call.id}: ${name} → ${next}`,
        ).toContain(next);
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
      .filter(file => file.endsWith('.json'))
      .map(file => file.slice(0, -5))
      .sort();
    expect([...ids].sort(), directory).toEqual(files);
    expect(new Set(ids).size, directory).toBe(ids.length);
  }
});

test('historical calls stay isolated and preserve the reported failure', async () => {
  const { callsForAgent } = await import('./fixtures');
  expect(callsForAgent('generated-agent')).toEqual([]);
  const calls = callsForAgent('clinic-scheduler');
  expect(calls).toHaveLength(7);
  expect(
    calls.find(call => call.id === 'new-patient-monday')?.transcript.some(turn => /Friday/.test(turn.text)),
  ).toBe(false);
  expect(calls.find(call => call.id === 'new-patient-friday')?.client_feedback).toBeTruthy();
  const existing = calls.find(call => call.id === 'existing-patient-booking')!;
  expect(existing.transcript.some(turn => /existing patient/.test(turn.text))).toBe(true);
  expect(existing.transcript.some(turn => turn.role === 'assistant' && /insurance/i.test(turn.text))).toBe(
    false,
  );
  // The unflagged call is evidence only: successful, no feedback, and the existing patient is asked for insurance.
  const unflagged = calls.find(call => call.id === 'existing-patient-insurance')!;
  expect(unflagged.outcome).toBe('successful');
  expect(unflagged.client_feedback).toBeUndefined();
  expect(unflagged.transcript.some(turn => turn.role === 'assistant' && /insurance/i.test(turn.text))).toBe(
    true,
  );
  // Decoys that look like violations but comply: detection must not accuse them.
  const volunteered = calls.find(call => call.id === 'existing-patient-volunteers-insurance')!;
  expect(volunteered.transcript.some(turn => turn.role === 'assistant' && /insurance/i.test(turn.text))).toBe(
    false,
  );
  expect(calls.find(call => call.id === 'new-patient-no-insurance')!.client_feedback).toBeUndefined();
  const before = JSON.stringify(calls);
  const agent = loadAgentFixture('clinic-scheduler');
  agent.nodes[1].task_messages = [{ role: 'developer', content: 'Repaired local draft' }];
  expect(JSON.stringify(callsForAgent('clinic-scheduler'))).toBe(before);
});

test('the seeded Riverside demo is a sound first draft with realistic, traceable production history', async () => {
  const { structuralIssues } = await import('./agent/conversation-quality');
  const { readFileSync } = await import('node:fs');
  const demo = loadRiversideDemo();
  expect(structuralIssues(demo.agent)).toEqual([]);
  expect(demo.guidelines).toBe(readFileSync('../fixtures/demo-sop.md', 'utf8').trimEnd());
  const calls = callsForAgent('riverside-family-clinic');
  expect(calls.length).toBeGreaterThanOrEqual(10);
  const failed = calls.filter(call => call.outcome === 'failed');
  expect(failed.length).toBeGreaterThanOrEqual(3);
  // Some failures are reported by the client and some are only visible by reading the transcript.
  expect(failed.some(call => call.client_feedback)).toBe(true);
  expect(failed.some(call => !call.client_feedback)).toBe(true);
  // The history also holds clean calls the Copilot must not accuse, and a successful call that violates the SOP.
  expect(calls.filter(call => call.outcome === 'successful' && !call.client_feedback).length).toBeGreaterThan(
    5,
  );
  // The weaknesses the failures trace to are really in the saved configuration.
  const slot = demo.agent.nodes.find(node => node.name === 'offer_new_patient_times')!.edges[0];
  expect(slot.properties.selected_day).toEqual({ type: 'string', description: expect.any(String) });
  expect(JSON.stringify(slot.properties)).not.toContain('enum');
});
