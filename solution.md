# Prosper agent development workspace

## Product scope

The app serves exactly two deployment-team jobs:

1. Build a working voice agent from a client's requirements.
2. Understand why a deployed agent failed and repair it quickly.

The graph editor, validation, persistence, evidence, and Test Call exist to make
those jobs trustworthy. Copilot creation, diagnosis, and iteration are the center
of the submission. A complete but small manual builder supports human review.
If a feature does not materially improve either story, do not build it.

This document defines the intended product and architecture, not a claim that all
features exist. [README.md](README.md) describes the codebase as it stands.
[TASKS.md](TASKS.md) alone tracks pending slices, dependencies, and acceptance.
This spec is frozen; change its scope or architecture only at the user’s request.

## The two demo stories

**Story A — implementation:** start with a minimal valid agent, paste clinic
guidelines, ask Copilot to build the workflow, review a validated graph proposal,
Apply, inspect or manually edit, and run a real Test Call.

The clinic scenario collects name and DOB, determines new versus existing
patient, collects insurance only for new patients, and lets existing patients
bypass insurance. Dr. Smith sees new patients only Monday and Wednesday. The
agent offers eligible times, confirms the selection, and ends cleanly. Times and
bookings are simulated; there is no scheduling-provider integration.

**Story B — repair:** explicitly switch to the mocked deployed scheduler, inspect
a problematic call, ask Copilot to investigate, follow transcript evidence to the
responsible graph element, review a targeted validated repair, Apply, and retest
the repaired saved revision. Unrelated configuration must survive the repair.

**Stretch goal only after Stories A and B are complete and reliable:** a user can
ask Copilot to review recent mocked calls and discover an unflagged issue. This is
optional, on-demand investigation, not background monitoring.

## Saved agent, drafts, and persistence

Use one canonical saved record per agent. It contains a stable ID, a numeric
revision, runtime-compatible agent JSON, and plain-text client guidelines.
Keep the repository envelope separate from the Python runtime payload: preserve
native snake_case fields, defaults, actions, and supported voice/model settings.
Graph positions, selection, conversation messages, and panel state are not runtime
JSON and do not increment the semantic revision.

Use a small `AgentRepository` boundary with a localStorage adapter. Its conceptual
contract is:

```ts
interface SavedAgent {
  id: string;
  revision: number;
  agent: AgentConfig;
  guidelines: string;
}

interface AgentRepository {
  getAgent(id: string): Promise<SavedAgent>;
  createAgent(candidate: Pick<SavedAgent, 'agent' | 'guidelines'>): Promise<SavedAgent>;
  saveAgent(
    id: string,
    candidate: Pick<SavedAgent, 'agent' | 'guidelines'>,
    expectedRevision: number,
  ): Promise<SavedAgent>;
}
```

Creation assigns an ID and an initial revision. Successful meaningful saved
changes increment the revision once; no-op saves do not. Guidelines are semantic
context, so saving changed guidelines also increments the revision. Validate
candidates through Python before persistence. Parse stored data as untrusted
input. Storage failures must not masquerade as successful saves or silently erase
an existing record.

Manual edits form a draft across the graph and guidelines. Save commits the whole
validated candidate; Cancel restores the saved record. Copilot reads saved state,
not partially edited drafts. Mark unsaved changes clearly, particularly before
Test Call, which always executes saved state. Do not silently merge a proposal
with manual drafts: require Save or Cancel before Apply. Protect unsaved drafts
when switching agents with an explicit Save/Cancel decision.

Reject commits whose agent ID or expected revision no longer matches the active
saved record. Recheck after asynchronous validation. Agent switches invalidate
in-flight work and proposals so late responses cannot change the newly selected
agent. Cross-browser-tab write coordination is out of scope.

Persistence is for a durable local demo. There is no database or version-history
UI. Local revisions are concurrency tokens, not a production deployment system.

## Workspace and minimal manual builder

Keep the existing graph workspace and its established controls. The context pane
provides **Details | Copilot** within Builder. Selecting a node or transition can
supply relevant context without resetting chat. Switching agents resets or
invalidates chat context. An explicit selector distinguishes the new/generated
agent from **Mocked existing deployed agent**; this is not a general dashboard.
Guidelines are visible and editable as plain text in agent details.

The builder displays steps and transitions and supports step selection,
instruction editing, adding/deleting steps, creating/deleting transitions,
changing targets, editing natural-language conditions, and configuring collected
fields. Support text, choice, number, yes/no, and required fields, with start/end
semantics. Preserve existing dragging, reconnecting, positions, and selection.
Show Save, Cancel, and useful validation errors. Do not add further graph
sophistication.

Graph references from Copilot are structured addresses, not merely text matches.
A node reference focuses the node; a transition reference identifies its source
and function. Highlight discussed and proposed elements, indicate changed elements
briefly after Apply, and handle deleted/missing references without crashing.

Use existing Tailwind and local shadcn/ui components and pane/chat presentation.
Preserve usable existing small-screen behavior without a new mobile project.

## Validation and mutation ownership

`backend/agent_builder/` owns authoritative Python validation and compilation.
Reject broken references, invalid transition/function definitions, unreachable
steps, graphs without paths to termination, and compilation failures. Return
useful errors to both manual UI and Copilot. TypeScript parses wire shapes and
supports safe operations; do not recreate the full Python validator in TS.

`frontend/lib/agent/` owns the TS contract and pure immutable atomic operations.
Both manual commits and Copilot patches use `applyAgentOperations()`. Operations
create candidates without mutating saved state; a failed operation, validation,
revision check, or persistence write leaves the saved record unchanged. Temporary
incomplete graph drafts may exist, but cannot become saved/runnable agents.

Keep App Router pages and handlers thin. Runtime HTTP clients belong in
`frontend/lib/runtime/`, with matching tested Python endpoints. Keep voice in
Python and preserve `backend/bot.py`'s supplied voice stack and dependency versions.
React hooks own workspace state; AI SDK owns chat/tool state. No extra state library.

## Copilot tools and human review

Keep the tool surface to:

- `get_agent`: read active saved agent, ID, revision, and guidelines.
- `propose_agent_patch`: submit a batch of existing structured operations bound to
  that agent ID and base revision; produce a candidate and Python validation result.
- `get_calls`: list only the active mocked agent's call evidence.
- `get_call`: read a specific call only if it belongs to that agent.

Introduce the call tools with evidence review. Do not expose separate low-level
add/delete/update tools or replacement-JSON edits. The model reasons about a
change and submits the operation batch. Tool results return validation failures
so Copilot can revise its proposal. Use same-origin Copilot APIs with credentials
and model configuration server-side. Since storage is browser-local, send a parsed
saved snapshot to the server for reasoning; the server must not pretend to read
browser localStorage. The client repository enforces revision checks on Apply.

The proposal shows a concise change summary, affected graph elements, validation
state, and **Dismiss / Apply**. A valid proposal is shown as ready to Apply only
after Python validation. Invalid proposals may show errors but cannot Apply.
Dismiss changes nothing. Apply is an explicit human save of the validated
candidate through the shared mutation/repository boundary; it is not an invisible
AI edit or a second unsaved draft. Stale proposals cannot Apply, even if their
content happens to look compatible. Validation unavailability fails closed.

Keep conversation alive through graph selection. Support provider failures,
malformed model output, invalid operations, unavailable validation, stale context,
and switching agents during generation without corrupting saved state. Surface
recoverable errors and a clear way to retry or generate a fresh proposal.

## Test Call and conversation quality

Start a browser voice call from Builder using the exact current saved agent JSON.
Never fall back to `example_flow.json` when another agent is active. Pin the call
to the saved ID/revision used to start it; later edits cannot change a running
session. Display status and live transcript, support clean hangup, release
microphone/WebRTC resources on stop or leaving the call, and return to Builder
without losing saved state. Stop the current call when changing agents.

Microphone denial, connection failure, and runtime errors must be recoverable.
The supplied `/client` does not accept the builder's current agent; use the
existing same-origin Test Call bridge and Python current-agent endpoint.

Graph correctness does not prove voice quality. Generated and repaired agents
must ask for missing information, clarify unclear answers without inventing data,
accept valid short answers, use corrections, remember information supplied early,
and avoid advancing past required information before receiving it. Cover these
conversation-quality scenarios with focused deterministic tests. Use a small
number of representative real calls to establish that the generated and repaired
agents behave correctly through the actual voice runtime. A generated-agent
happy path, one meaningful branching/edge case, and the repaired Friday scenario
are sufficient; do not require a separate live call for every quality case. Mock
transcripts and synthetic recorded tool traces are not live evidence.

## Mocked production evidence and diagnosis

Use 3–4 synthetic calls for the mocked deployed scheduler: a clean successful
booking, a client-reported scheduling failure, an unflagged problematic call, and
an existing-patient booking. Reuse and extend `fixtures/` directly; do not duplicate
samples. Keep `backend/example_flow.json` as the supplied original example.

Each call has a stable call ID, agent ID, transcript, outcome, graph path/relevant
nodes, and optional client feedback. A source agent revision may be included to
make historical context explicit. A successful booking label alone is not proof
that its transcript complied with guidelines. Calls remain historical evidence
after a local repair; do not rewrite them to look repaired.

The review UI lists calls only for the selected mocked deployed agent, opens a
transcript with outcome/feedback, and links relevant graph nodes. Copilot combines
saved guidelines, saved configuration, transcript, path, and complaint to explain
the cause. Cite concrete transcript turns in the UI and identify affected nodes
or transitions structurally. Distinguish observed facts from hypotheses; missing
historical graph elements must remain understandable rather than misattributed.

For the Friday failure, explain the conflict between new-patient scheduling rules
and `offer_times`, then propose the smallest necessary patch. Preserve
existing-patient scheduling, insurance behavior, and unrelated configuration.
Validate, review, Apply, and immediately offer a Test Call of the repaired revision.
For the optional unflagged-discovery stretch goal, inspect call evidence rather
than reading a prewritten issue answer; show evidence and offer the same
human-reviewed repair flow.

## Deliberate exclusions

Do not build auth/login/users, teams/organizations, roles/permissions, billing,
marketplaces, a general dashboard, databases/PostgreSQL, queues/Redis, real call
ingestion, background agents/monitoring/alerts, embeddings, analytics/custom
reporting, or a full observability stack. No EHR, scheduling-provider integration,
patient records, or HIPAA platform work.

No production deployment/versioning architecture, history or rollback UI,
collaboration/comments, generic rules engine, prompt playground, model selector,
arbitrary LLM settings, or voice selector unless the supplied runtime requires it.
No guideline uploads/PDFs/knowledge bases/rich text/version history or general
source-citation infrastructure; transcript references for diagnosis remain in scope.
No template library, cloning, import/export system, fancy minimap, advanced layout,
additional drag/drop behaviors, or extensive mobile optimization. Use WebSockets
only if required by the supplied voice stack.

These are plausible production features, but they do not reduce the two
bottlenecks this exercise targets. Spend the implementation budget on Copilot
creation, evidence-backed diagnosis, and safe iteration.
