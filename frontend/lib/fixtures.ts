import { z } from 'zod';
import originalScheduler from '../../backend/example_flow.json' with { type: 'json' };
import clinicScheduler from '../../fixtures/agents/clinic-scheduler.json' with { type: 'json' };
import guidelines from '../../fixtures/guidelines/demo-clinic.json' with { type: 'json' };
import failedCall from '../../fixtures/calls/new-patient-friday.json' with { type: 'json' };
import successfulCall from '../../fixtures/calls/new-patient-monday.json' with { type: 'json' };
import flaggedIssue from '../../fixtures/issues/friday-restriction.json' with { type: 'json' };
import { parseAgent } from './agent/schema';

export const callSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  outcome: z.enum(['successful', 'failed']),
  graph_path: z.array(z.string()),
  transcript: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() })),
  client_feedback: z.string().optional(),
});
export type ProductionCall = z.infer<typeof callSchema>;

export const guidelineSchema = z.object({ id: z.string(), agent_id: z.string(), text: z.string() });
export const issueSchema = z.object({
  id: z.string(), call_id: z.string(), guideline_id: z.string(), summary: z.string(), node_name: z.string(),
});

// A small explicit registry avoids filesystem access in browser code and duplicated data.
export const agentFixtures = { 'original-scheduler': originalScheduler, 'clinic-scheduler': clinicScheduler };
export type AgentFixtureId = keyof typeof agentFixtures;
export function loadAgentFixture(id: AgentFixtureId) {
  return parseAgent(agentFixtures[id]);
}
export function loadDemoContext() {
  return {
    guidelines: [guidelineSchema.parse(guidelines)],
    calls: [failedCall, successfulCall].map(call => callSchema.parse(call)),
    issues: [issueSchema.parse(flaggedIssue)],
  };
}
