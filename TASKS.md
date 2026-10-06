# Pending implementation tasks

Frozen scope: [solution.md](solution.md). Current code inventory and commands:
[README.md](README.md). This is the only roadmap: remove completed work rather
than appending history. All items below are pending; existing foundations are
reused, not scheduled for a rebuild. Derive implementation from the existing code
against the frozen spec; do not reopen architecture planning.

## 1. Saved agent repository and context — NEXT

**Status:** ready. **Dependencies:** existing operations, Python validation, draft
editor, and current-agent Test Call bridge.

- [ ] Add a parsed saved-record contract with stable ID, revision, runtime agent,
  and plain-text guidelines; implement an AgentRepository with localStorage.
- [ ] Support creating a minimal valid agent and selecting the existing mocked
  scheduler under the label “Mocked existing deployed agent.” Reuse fixtures.
- [ ] Route manual Save through candidate operations, Python validation, and a
  revision-checked repository commit. Commit graph and guideline drafts together.
- [ ] Restore saved agents after refresh; Cancel restores saved values. Increment
  revision once per meaningful commit, including guideline-only changes; not for
  no-ops, selection, or geometry.
- [ ] Reject commits whose agent ID or expected revision no longer matches the
  active saved record; recheck after asynchronous validation. Surface malformed/
  unavailable storage safely. Cross-browser-tab coordination is out of scope.
- [ ] Protect dirty drafts on agent switch; isolate selection and asynchronous
  completions by agent. Stop active calls on switch.
- [ ] Keep Test Call on the exact saved payload and show its saved ID/revision;
  clearly distinguish any unsaved draft from the call's configuration.

**Acceptance:** refresh preserves two distinct saved agents and their guidelines;
Cancel and failed validation/storage leave saved state unchanged. Overlapping
saves within the active app cannot overwrite a newer revision. Switching agents
during a save cannot alter the new selection. A call after Save uses the committed payload,
while a call with an unsaved draft uses the labeled saved version. Focused unit,
integration, e2e, desktop/mobile inspection, and an actual call cover the change.

## 2. Integrated Copilot and reviewed structured proposals

**Status:** pending. **Dependencies:** 1.

- [ ] Integrate the existing chat presentation into Builder's Details | Copilot
  pane using AI SDK state and a same-origin server API.
- [ ] Implement `get_agent` and `propose_agent_patch` against the active saved
  snapshot, guidelines, ID, revision, and relevant selected node/transition context.
- [ ] Parse structured operation batches; use `applyAgentOperations()` and Python
  candidate validation. Return validation errors to the model for repair.
- [ ] Show summaries, affected graph elements, validation state, Dismiss, and Apply.
  Apply explicitly commits the validated patch via the same repository path as
  manual saves. Require manual drafts to be saved/canceled before Apply.
- [ ] Keep chat through node selection; invalidate it on agent switches. Reject
  stale proposals, including guideline-only revision changes and late responses.
- [ ] Add structural node/transition references, focus-on-click, proposal and
  discussion highlights, and a brief changed-elements indication after Apply.
- [ ] Handle provider failure, malformed output, missing references, invalid
  proposals, and unavailable validation without saved-state mutation.
- [ ] Connect a real Copilot eval adapter; extend the synthetic rename-only harness
  to capture actual tool execution and approval behavior.

**Acceptance:** a real model reads saved context and returns a validated structured
proposal without changing the agent. Dismiss changes nothing; explicit Apply saves
once. Invalid/stale proposals cannot Apply. Chat persists on selection but never
leaks between agents. Test negative paths deterministically, verify browser
interaction and desktop/mobile layout, and run a live Copilot eval.

## 3. Story A: guidelines to working agent and real call

**Status:** pending. **Dependencies:** 1–2.

- [ ] Exercise creation from a minimal valid agent with the demo clinic guidelines:
  name, DOB, patient type, new-patient-only insurance, existing-patient bypass,
  Dr. Smith's Monday/Wednesday new-patient restriction, eligible times,
  confirmation, and clean end.
- [ ] Ensure Copilot generates the complete graph as one reviewable validated
  operation batch; human inspection and manual edits still work afterward.
- [ ] Expand behavioral evals beyond exact rename operations to test required
  branching, scheduling constraints, native payload preservation, and approval.
- [ ] Cover missing data, ambiguity, valid short answers, corrections, information
  supplied early, and required-data gating with focused deterministic tests. Fix
  confirmed causes at the owning boundary while preserving the voice stack.
- [ ] Run representative real calls: a generated-agent happy path and one meaningful
  branching/edge case. Do not run a separate live call for every quality case.

**Acceptance:** paste guidelines → Copilot → validated proposal → Apply → inspect
or edit → real Test Call. Both new- and existing-patient paths behave correctly;
no disallowed new-patient slots, invented required information, stale corrected
values, or unnecessary repeated questions in the focused test coverage. Record
actual model evidence and the representative live calls; missing services leave
live criteria open. These calls and the repaired Friday call in slice 5 establish
the demo’s live voice behavior without requiring every scenario to run live.

## 4. Mocked call evidence and minimal production review

**Status:** pending. **Dependencies:** 1. Implement after Story A to keep focus.

- [ ] Extend the two existing call fixtures to 3–4 covering clean success, reported
  failure, unflagged problem, and existing-patient booking; use stable call/agent
  IDs, transcript, outcome, graph path, and optional feedback/source revision.
- [ ] Correct the clean-success fixture: `new-patient-monday.json` currently offers
  Friday to a new patient even though the booking ends on Monday. Keep the
  intentional Friday failure as diagnostic evidence.
- [ ] Make unflagged evidence reflect an actual repairable behavior in the mocked
  saved graph, not an unrelated transcript defect or a prewritten issue answer.
- [ ] Add recent call list, transcript, outcome/feedback, and graph navigation for
  the explicitly selected mocked deployed agent.
- [ ] Implement `get_calls` and `get_call` with active-agent filtering and ownership
  checks, including unknown IDs and missing historical graph references.

**Acceptance:** calls never leak to the new/generated agent. Each transcript/path
supports its scenario and links to valid graph elements or an explicit historical
missing-reference state. Historical calls remain unchanged after saved revisions.
Test fixture integrity, tool isolation, and UI navigation; inspect changed layout.

## 5. Story B: evidence-backed diagnosis, targeted repair, retest

**Status:** pending. **Dependencies:** 2 and 4; reuse Story A's call/eval path.

- [ ] Let the user ask about the reported failed call. Ground diagnosis in saved
  guidelines/configuration and call transcript/path/outcome/feedback.
- [ ] Render concrete transcript-turn references and structural graph links with
  highlights. Distinguish evidence from a hypothesis when context is insufficient.
- [ ] Propose the smallest patch for the scheduling failure; preserve unrelated
  configuration and existing-patient/insurance behavior.
- [ ] Validate, review, Apply through the shared proposal flow, and immediately
  allow a Test Call of the repaired saved revision.
- [ ] Extend live and deterministic evals to check evidence grounding, repair
  scope, stale/missing context, approval, and behavior after repair.

**Acceptance:** failed call → evidence-backed cause → highlighted graph → targeted
validated patch → Apply → real retest with correct scheduling. The patch preserves
unrelated fields and paths. A model/tool failure cannot change saved state or
invent an evidence citation. Actual live diagnosis and retest evidence are required.

## 6. Optional stretch: on-demand discovery of an unflagged issue

**Status:** optional / last. **Dependencies:** 3–5.
**Stretch goal only after Stories A and B are complete and reliable.** Do not
prioritize this over either core story or make it a core completion requirement.

- [ ] Support “Review recent calls and tell me whether anything looks wrong” using
  the active mocked agent's call tools and guidelines.
- [ ] Detect the unflagged fixture's guideline violation with concrete evidence;
  identify the responsible graph elements and offer a minimal validated repair.
- [ ] Add positive and negative eval cases: discover the issue without consulting
  the prewritten issue fixture, and do not label clean calls as failures.

**Acceptance:** a live Copilot review discovers the unflagged problem, cites real
transcript turns, and offers the normal human-approved repair/retest flow. No
scheduled monitoring, background agents, ingestion, or analytics infrastructure.
