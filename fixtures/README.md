# Synthetic demo fixtures

All names, dates, insurance details, transcripts and feedback here are invented.
The deliberately flawed `clinic-scheduler` is a mocked existing deployed agent
for Workflow B — Production iteration in `solution.md`. It offers Friday to new
patients; its graph is structurally valid. These calls did not come from the
correctly generated cold-start agent in Workflow A — Initial deployment.
The Monday call has a successful outcome, even though it exposes the same flawed
offer. Do not "fix" the failed-call fixture to make an eval green.

- `agents/clinic-scheduler.json`: small clinic graph with the missing restriction.
- `../backend/example_flow.json`: unchanged original scheduler; registered as
  `original-scheduler` without duplicating the runtime's example data.
- `guidelines/`: clinic instructions linked by `agent_id`.
- `calls/`: mocked production calls with transcript, outcome, path and feedback.
- `issues/`: flagged issue linking a call, guideline, and relevant node.

`frontend/lib/fixtures.ts` parses and returns independent values for browser code,
tests and evals. Keep its registry in sync when adding fixtures; relationship tests
must pass. Python builder tests discover `agents/*.json` and compile them offline.
Behavioral scenarios and synthetic traces live separately under `evals/` (see
`EVALS.md`). Never check in real patient data or provider credentials.
