import { z } from 'zod';
import originalScheduler from '../../backend/example_flow.json' with { type: 'json' };
import clinicScheduler from '../../fixtures/agents/clinic-scheduler.json' with { type: 'json' };
import riversideFamilyClinic from '../../fixtures/agents/riverside-family-clinic.json' with { type: 'json' };
import riversideGuidelines from '../../fixtures/guidelines/riverside-family-clinic.json' with { type: 'json' };
import guidelines from '../../fixtures/guidelines/demo-clinic.json' with { type: 'json' };
import failedCall from '../../fixtures/calls/new-patient-friday.json' with { type: 'json' };
import successfulCall from '../../fixtures/calls/new-patient-monday.json' with { type: 'json' };
import existingCall from '../../fixtures/calls/existing-patient-booking.json' with { type: 'json' };
import wednesdayCall from '../../fixtures/calls/new-patient-wednesday.json' with { type: 'json' };
import existingInsuranceCall from '../../fixtures/calls/existing-patient-insurance.json' with { type: 'json' };
import volunteersCall from '../../fixtures/calls/existing-patient-volunteers-insurance.json' with { type: 'json' };
import noInsuranceCall from '../../fixtures/calls/new-patient-no-insurance.json' with { type: 'json' };
import riversideConfirmationMissingDetails from '../../fixtures/calls/riverside-confirmation-missing-details.json' with { type: 'json' };
import riversideExistingPatientFriday from '../../fixtures/calls/riverside-existing-patient-friday.json' with { type: 'json' };
import riversideExistingPatientInventedTime from '../../fixtures/calls/riverside-existing-patient-invented-time.json' with { type: 'json' };
import riversideExistingPatientVolunteersInsurance from '../../fixtures/calls/riverside-existing-patient-volunteers-insurance.json' with { type: 'json' };
import riversideNewPatientCorrectsDob from '../../fixtures/calls/riverside-new-patient-corrects-dob.json' with { type: 'json' };
import riversideNewPatientFridayBooked from '../../fixtures/calls/riverside-new-patient-friday-booked.json' with { type: 'json' };
import riversideNewPatientFridayDeclined from '../../fixtures/calls/riverside-new-patient-friday-declined.json' with { type: 'json' };
import riversideNewPatientFridayUnreported from '../../fixtures/calls/riverside-new-patient-friday-unreported.json' with { type: 'json' };
import riversideNewPatientInventedTime from '../../fixtures/calls/riverside-new-patient-invented-time.json' with { type: 'json' };
import riversideNewPatientMonday from '../../fixtures/calls/riverside-new-patient-monday.json' with { type: 'json' };
import riversideNewPatientNoInsurance from '../../fixtures/calls/riverside-new-patient-no-insurance.json' with { type: 'json' };
import riversideOutOfScopeRefill from '../../fixtures/calls/riverside-out-of-scope-refill.json' with { type: 'json' };
import riversideEmergencyKeptBooking from '../../fixtures/calls/riverside-emergency-kept-booking.json' with { type: 'json' };
import riversideSlotTakenConfirmed from '../../fixtures/calls/riverside-slot-taken-confirmed.json' with { type: 'json' };
import riversideIssue from '../../fixtures/issues/riverside-friday-booked.json' with { type: 'json' };
import flaggedIssue from '../../fixtures/issues/friday-restriction.json' with { type: 'json' };
import { parseAgent } from './agent/schema';
import { callSchema } from './platform/schema';

export const guidelineSchema = z.object({ id: z.string(), agent_id: z.string(), text: z.string() });
export const issueSchema = z.object({
  id: z.string(),
  call_id: z.string(),
  guideline_id: z.string(),
  summary: z.string(),
  node_name: z.string(),
});

// Production-call history of the deployed Riverside demo agent (newest first).
const riversideCalls = [
  riversideEmergencyKeptBooking,
  riversideSlotTakenConfirmed,
  riversideNewPatientMonday,
  riversideExistingPatientFriday,
  riversideNewPatientFridayBooked,
  riversideConfirmationMissingDetails,
  riversideNewPatientCorrectsDob,
  riversideExistingPatientInventedTime,
  riversideNewPatientFridayDeclined,
  riversideOutOfScopeRefill,
  riversideNewPatientFridayUnreported,
  riversideNewPatientNoInsurance,
  riversideNewPatientInventedTime,
  riversideExistingPatientVolunteersInsurance,
];

// A small explicit registry avoids filesystem access in browser code and duplicated data.
// `original-scheduler` is the starter's sample format and `clinic-scheduler` a minimal three-step agent that
// uses the same tools; both exist for tests and evals and are never seeded into the app (only Riverside is).
export const agentFixtures = {
  'original-scheduler': originalScheduler,
  'clinic-scheduler': clinicScheduler,
  'riverside-family-clinic': riversideFamilyClinic,
};
export type AgentFixtureId = keyof typeof agentFixtures;
export function loadAgentFixture(id: AgentFixtureId) {
  return parseAgent(agentFixtures[id]);
}
/** The seeded demo agent and the SOP it was built from. Its call history is served under the same ID. */
export function loadRiversideDemo() {
  return {
    agent: loadAgentFixture('riverside-family-clinic'),
    guidelines: guidelineSchema.parse(riversideGuidelines).text,
  };
}
export function loadDemoContext() {
  return {
    guidelines: [guidelineSchema.parse(guidelines), guidelineSchema.parse(riversideGuidelines)],
    calls: [
      failedCall,
      successfulCall,
      existingCall,
      wednesdayCall,
      existingInsuranceCall,
      volunteersCall,
      noInsuranceCall,
      ...riversideCalls,
    ].map(call => callSchema.parse(call)),
    issues: [issueSchema.parse(flaggedIssue), issueSchema.parse(riversideIssue)],
  };
}

export function callsForAgent(id: string) {
  return loadDemoContext().calls.filter(call => call.agent_id === id);
}
