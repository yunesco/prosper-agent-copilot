# Implementation slices

Follow `solution.md` for product scope and `AGENTS.md` for workflow.
Implement remaining slices **04 → 05 → 06 → 07 → 08**.
Pending work only. Statuses: `ready`, `blocked`, `in progress`. Remove completed
items after their required checks pass. Do not append history or verification logs.

## Shared validation boundary

Python `AgentBuilder` owns runtime validation and compilation. TypeScript checks
payload shape and mutation preconditions. Apply operations atomically, validate
the completed candidate in Python, then commit. Validation failure or unavailable
Python leaves the current agent unchanged. Validate again before a voice session.
Extend contract tests for serialization/defaults/preservation; do not duplicate
Python's graph validator in TypeScript.

## 04 — Call the current agent

Status: ready.

- Implement a Python endpoint accepting the current `AgentConfig` for a test session.
  Reuse validation; preserve the voice pipeline and runner. Isolate each session's config.
- Implement the corresponding frontend runtime client and browser call start/stop.
- Surface invalid graph, unavailable runtime, denied microphone, and disconnection.
- Test payload rejection, session isolation, original-example compatibility, and HTTP
  failures. Browser tests mock voice transport while exercising real app state.
- Finish: `make verify`, `make e2e`, then a real call; edit an instruction and call
  again to prove the updated graph is used. Report expected/observed behavior.

## 05 — Copilot proposal and Apply

Status: blocked on 04.

- Add embedded AI SDK chat and a server route with `get_agent`, `propose_agent_patch`,
  and `validate_agent`. Use the shared operations from 03 and chat presentation from 01.
- `propose_agent_patch` returns structured proposed operations without mutating
  product state. Show a concrete proposal/preview, then validate the completed
  candidate through Python. Only after explicit human Apply, commit the approved
  operations through `applyAgentOperations`; dismissal leaves state unchanged.
- Prevent stale proposals from overwriting manual edits. Display malformed/empty
  proposals, validation/provider failures, and Apply errors.
- Connect the actual Copilot implementation to the eval adapter. Capture tool IDs,
  inputs/results/errors, proposals, and model configuration from execution.
- Add evals for a targeted change, invalid proposal, and no approval. Test actual
  state preservation and approval enforcement, not just the trace's `applied` flag.
- Finish: `make verify`, mocked `make e2e`, live `make eval-copilot`; inspect a
  successful proposal and a failure.

## 06 — Create an agent from clinic guidelines

Status: blocked on 05.

- Workflow A — Initial deployment: submit `demo-clinic` guidelines and propose a
  complete graph as structured operations through `propose_agent_patch`, using
  the same preview, Python validation, and Apply path.
- Add `add_node`, `delete_node`, `add_edge`, `delete_edge`, and remaining update fields
  needed for initial node, terminal flags, collected properties, and required fields.
- Start from a minimal `AgentConfig`; create/connect/update/remove nodes in an atomic
  batch. Intermediate states may be incomplete; validate the completed candidate.
- Result: collect name/DOB, insurance only for new patients, and restrict Dr. Smith's
  new patients to Monday/Wednesday. Support inspection and manual adjustment.
- Test operation addressing/order, atomic failures, native-data preservation, and
  Python acceptance. Evaluate requirements and behavior, allowing equivalent graphs.
- Finish: `make verify`, mocked `make e2e`, live `make eval-copilot`, and a real call
  against the generated agent. Failure leaves the previous agent intact.

## 07 — Inspect mocked calls and a flagged issue

Status: blocked on 06.

- Display successful/failed calls and the flagged issue from fixture loaders.
- Show transcript, outcome, graph path, and feedback. Opening the issue selects its
  call and `offer_times`; selection must not mutate the agent. Handle missing references.
- Workflow B — Production iteration: explicitly switch to the intentionally flawed
  checked-in `clinic-scheduler`, labeled as a mocked existing deployed agent.
  Its flagged Friday call belongs to this fixture, not the correctly generated
  cold-start agent from Workflow A. Keep the same builder and call surfaces.
- Finish: `make verify`, `make e2e`, inspect call/issue selection and its context.

## 08 — Diagnose, apply a fix, and retest

Status: blocked on 04, 05, 07. Implement after 06.

- Add read-only `get_calls` over the supplied mocked calls so Copilot can surface
  suspected issues with call/transcript evidence, including unflagged calls. Keep
  human review; no production ingestion or background monitoring.
- Continue Workflow B with `get_call`. Give Copilot the failed Friday call, the
  current mocked deployed `clinic-scheduler` agent, and guideline.
  Explain the missing restriction with evidence and identify `offer_times`.
- Propose the smallest correction through `propose_agent_patch`, preview, completed
  candidate validation in Python, and explicit human Apply, then commit through
  `applyAgentOperations`. Preserve unrelated and existing-patient behavior.
- Add evals for issue discovery/evidence, diagnosis, relevant change, approval, and preservation.
- Finish: `make verify`, mocked `make e2e`, live `make eval-copilot`, and a real
  post-fix call demonstrating the restriction.
- Demo both connected workflows: guidelines → creation → inspection / manual
  adjustment → live call; then explicitly switch to the mocked existing deployed
  agent + flagged call → diagnosis → reviewed fix → Apply → retest.
