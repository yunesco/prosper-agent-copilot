// Names and one-line purposes of the tools a step can use. The runtime registry is
// backend/agent_builder/tools.py; a test in tools.test.ts keeps the two lists identical.
export const TOOL_CATALOG = [
  {
    name: 'check_availability',
    description: "Dr. Smith's next open slots for a new or existing patient (returns slot_id and label).",
  },
  {
    name: 'book_appointment',
    description: 'Book a slot_id returned by check_availability; fails on a taken slot.',
  },
  {
    name: 'lookup_patient',
    description: 'Find a patient record by full name and date of birth (YYYY-MM-DD).',
  },
  {
    name: 'verify_eligibility',
    description: 'Check an insurance plan is accepted; returns copay and deductible.',
  },
  { name: 'transfer_to_human', description: 'Hand the caller to clinic staff with a reason.' },
] as const;

export const toolNames = TOOL_CATALOG.map(tool => tool.name);
