# Pending implementation slices

Architecture and scope: [`solution.md`](solution.md). Workflow: [`AGENTS.md`](AGENTS.md).
Order: **05 → 06 → 07 → 08 → 09**. All of **05–06 must pass before 07 begins**.
Manual development may continue while live checks are pending; pending live
acceptance blocks Copilot.
Remove completed work; do not append history or verification logs.

For each implementation slice, retain focused behavioral and negative-path tests,
`make verify`, `make e2e` for UI behavior, and desktop/mobile screenshot inspection
for layout changes. Use injected fakes in deterministic tests. Actual calls are
required for voice acceptance; mocks and unavailable live services do not close
live criteria. Follow the verification procedures in [README.md](README.md#verification).

## Voice interruption live acceptance

Status: live comparison against the original voice pipeline pending.

- Run actual browser calls with the updated backend: silent headphone listening,
  intentional interruption, and a paused multi-part answer. Capture interruption
  timing, verify complete questions during silence, and verify no inference during
  the incomplete pause. Check for false interruptions from VAD and stale partials
  with the restored defaults, and interrupted/unplayed text in transcript events.
- Preserve attempt evidence under ignored `evals/results/`. Synthetic microphone
  silence alone does not establish the real headphone/microphone scenario.

## 05 — Complete manual agent authoring

Status: ready.

- Support creation from the valid one-step seed in `solution.md`, agent name and
  instructions, add/delete steps and transitions, start/end behavior, function
  renaming, goals, role overrides, routing, collected fields and required fields.
- Extend shared immutable operations as needed. Use named transition addressing;
  define sequential rename/delete behavior in atomic batches. Keep runtime
  voice/model settings read-only and preserve native payloads.
- Add controls in the existing inspector. No layout redesign, drag-to-connect or
  editor extras. A draft must span multiple steps so adding connections and
  repairing references after deletion can be saved together.
- Explicit Save Python-validates the completed candidate and commits atomically
  only at the current revision. Deletion must repair incoming transitions/start
  reference in the same batch or fail unchanged. Cancel and failures preserve the
  saved agent. Selection and drafts remain correctly addressed after transition
  deletion or renaming, including across selection/tab/pane changes.
- Test deletion followed by updates in the same batch, missing/duplicate addresses,
  invalid names/required fields, reachability/endings, stale Save, atomic failure
  and native JSON preservation. Maintain all-step compilation/multi-error regressions.
- Browser tests cover creation, agent and step editing, connection, deletion,
  renaming, multi-step Save, cancellation and validation failures. Verify an actual
  call through a manually inserted insurance step plus a saved route change.
  Use the original scheduler in session; preserve the flawed clinic fixture.
- Verify an actual voice call after restoring the original model configuration:
  greet once, wait through caller silence, ask for missing details, and wait for
  the caller to select a slot before confirming. Compare model behavior with the
  same prompts; a live API tool-call check does not establish turn-taking quality.

## 06 — Manual call review, repair, and retest

Status: depends on 05; completes the manual gate before 07 can begin.

- Add a clearly labelled switch to the fixture-loaded `clinic-scheduler`, marked
  **mocked existing deployed agent**. Handle unsaved work, active calls, revision,
  selection and drafts as specified in `solution.md`. Keep evidence scoped to its
  agent; do not attribute mocked deployed calls to the manually built agent.
- Show guidelines, successful/failed calls and the Friday issue with transcripts,
  outcomes, graph paths and feedback. Opening the issue selects its call and
  `offer_times` without mutating the agent. Handle missing references.
- Prove Workflow B manually: inspect Friday evidence, locate/edit `offer_times`
  and optionally its `select_time` description, Save and make a live retest. Enforce
  Monday/Wednesday for new patients while preserving existing-patient scheduling
  and conditional insurance collection. Do not add an insurance branch to this
  targeted fix; verify existing patients skip insurance.
- Separately prove Workflow A manually: start from the valid seed, use `demo-clinic`
  guidelines to build name/DOB collection, explicit patient-type branching,
  insurance only for new patients and Monday/Wednesday scheduling for Dr. Smith's
  new patients. Inspect/edit, validate, Save and call the full branching agent.
- Test switching, evidence scope, missing references and issue-to-step navigation;
  cover the review/repair/retest UI and inspect desktop/mobile layouts. Run actual
  calls for both manual workflows using the applicable conversation scenarios below.

## 07 — Copilot proposals and Apply

Status: blocked until all acceptance criteria in 05–06 pass, including live checks.

- Implement the architecture in `solution.md`: shared `frontend/lib/copilot/run()`
  with injected validator, thin same-origin route, OpenAI provider and server-only
  key, request saved snapshot/revision, bounded execution and real eval adapter.
- Install/lock the provider dependency and document frontend credential setup.
  Keep `useChat` in BuilderShell and add Details / Copilot tabs within the existing
  pane, usable while a step is selected. Preserve conversation across pane/mode/
  selection changes; agent switches reset conversation and invalidate old proposals.
- Expose `get_agent` and `propose_agent_patch` over the completed manual operation
  set. Copilot must not introduce editing capabilities absent from manual authoring.
  The proposal tool constructs and Python-validates candidates, returns all errors
  for repair, and never mutates saved state. No `validate_agent` tool.
- Show concrete preview/validation status and Apply/Dismiss. Only explicit,
  current-revision Apply commits through the same `applyAgentOperations()` used by
  manual Save. Invalid, stale or unavailable validation cannot commit.
- Test targeted edits, multi-error repair, malformed/empty proposals, provider and
  validation failures, stale proposals after manual edits/switches, dismissal and
  no approval. Assert real state preservation, not only a trace flag.
- Run live `make eval-copilot`; inspect successful and failed proposals from the
  actual loop in addition to deterministic and UI verification.

## 08 — Copilot generation from guidelines

Status: depends on 07 and the completed manual authoring/workflow foundation.

- Implement Workflow A from `demo-clinic` using the valid one-step seed defined in
  `solution.md`. Replace/repurpose that seed in one atomic structural batch using
  operations already supported manually.
- Generate name/DOB collection, explicit patient-type routing, insurance only for
  new patients and Monday/Wednesday restriction for Dr. Smith's new patients.
  Validate, review, Apply, inspect/edit and live-test; failure preserves the prior agent.
- Include conversation-quality instructions and the scenarios below in the
  generation prompt/evals. Grade behavior and guideline adherence, allowing equivalent graphs.
- Test structural operations via the actual Copilot, invalid generation, repaired
  proposals and no approval. Run live `make eval-copilot` and actual generated-agent
  calls for the applicable scenarios, alongside deterministic and UI verification.

## 09 — Copilot diagnosis and repair

Status: depends on 07 and 08; uses the call-review context completed in 06.

- Implement read-only `get_call`/`get_calls` over supplied fixtures. Discover issues
  with transcript evidence, including unflagged calls; no ingestion or background monitoring.
- Diagnose the Friday failure using current fixture, call and guideline. Return
  structured affected step/transition names and render those highlights; handle missing/stale references.
- Target `offer_times` and optionally its transition description. Enforce new-patient
  Monday/Wednesday without changing the existing-patient schedule or adding an
  insurance branch. Preserve conditional insurance instructions; explicitly test
  existing patients skip insurance. Full structural branching belongs to Workflow A.
- Evaluate evidence, relevant highlights, minimal change, unrelated-field preservation,
  approval/staleness and applicable conversation scenarios. Run live `make eval-copilot`
  and actual post-fix calls for new and existing patients, including the Friday
  restriction, alongside deterministic and UI verification.
- Demonstrate both connected Copilot workflows, explicitly switching to the mocked
  deployed agent before diagnosis; do not attribute its calls to the generated agent.

## Pending conversation evaluations — manual 06, then Copilot 08 and 09

Apply these scenarios to the manually built and manually repaired agents first.
Then use them in the 08 generation prompt and applicable actual calls against
Copilot-generated/repaired agents. Grade behavior and transition timing, not exact
phrasing. Apply visit-reason examples only where the agent asks for a visit reason.

| Scenario | Expected behavior |
| --- | --- |
| Normal booking | Collect required details, offer an allowed time and confirm |
| Unintelligible answer | Clarify without advancing or inventing information |
| Unrelated/name-only visit reason | Clarify the reason before transitioning |
| Valid short reason, such as “checkup” | Accept without unnecessary interrogation |
| Missing required information | Ask for it before advancing |
| Caller correction | Use the corrected value in subsequent steps and confirmation |
| Information supplied early | Retain it without asking again unnecessarily |

For manual 06 and applicable Copilot 08/09 calls, separately verify new-patient
insurance collection, Friday rejection and Monday/Wednesday acceptance,
existing-patient scheduling preservation, and skipping insurance for existing
patients. Record expected/observed behavior and failures as described in
[README.md](README.md#verification). Each slice must independently satisfy its
applicable live criteria; remove pending criteria only when fulfilled.
