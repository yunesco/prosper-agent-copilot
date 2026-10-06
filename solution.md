# Prosper Voice Agent Builder

## Product and scope

Copilot is the main feature. The graph makes its work inspectable and manually
editable; Test Call runs the saved agent through Prosper's existing Python voice
stack. The Copilot demo proves two workflows:

- **A — Initial deployment:** clinic guidelines → generated graph → review and
  Apply → inspect/manual adjustment → live call.
- **B — Production iteration:** explicitly switch to the labelled mocked deployed
  `clinic-scheduler` → inspect flagged Friday call → evidence-backed diagnosis →
  targeted proposal → review and Apply → live retest.

Workflow B's call evidence belongs to the checked-in flawed fixture, never to
Workflow A's generated agent. Copilot can also inspect the supplied mocked calls
for unflagged issues, with transcript evidence and human review.

Build graph inspection/editing, browser calls, embedded Copilot, generation, and
mocked call diagnosis. Mock scheduling/backend behavior and production history.
Exclude auth, organizations, databases, EHR, production ingestion/analytics,
deployment/versioning, autonomous changes, and a general healthcare rules engine.

`solution.md` owns architecture and scope. `TASKS.md` is the sole source for slices, dependencies, status and acceptance
criteria. `AGENTS.md` owns engineering workflow; `README.md` owns setup
and verification procedures. Workspace interaction decisions live below.

## Architecture and ownership

- Next.js App Router and strict TypeScript; thin pages and HTTP handlers.
- React Flow for the canvas; Tailwind CSS and standard local shadcn/ui components.
- AI SDK for chat, streaming and tool state. React hooks own product state; no
  additional state library.
- `backend/agent_builder/` owns runtime validation and Pipecat compilation.
  Preserve `backend/bot.py`'s voice stack and provider versions.
  Turn starts use Pipecat's original defaults: VAD, interim transcripts, or final
  transcripts can interrupt. Smart Turn and VAD thresholds remain unchanged.
  STT language detection and RTVI transcript events use the provider/library defaults.
- `frontend/lib/agent/` owns the TS wire contract and immutable atomic mutations.
- `frontend/lib/runtime/` owns runtime HTTP clients, with matching Python endpoints.
  Browser traffic uses same-origin APIs; credentials remain server-side.
- `frontend/lib/copilot/` will own the model, prompt, tools and bounded execution
  loop. Export one `run()` entry point, with the Python validator injected. The app
  route adapts its stream to HTTP; the eval adapter captures the same execution.
  No separate eval implementation or scoring expectations in the model context.

Use the existing synthetic `fixtures/` and `backend/example_flow.json` directly.
The supplied `/client` still runs the example file; it does not accept builder edits.

## Contract and Python validation

Wire fields remain snake_case with Python/TS defaults preserved. Unknown fields
on the agent, node and edge objects are discarded by both parsers. Nested native
message/action payloads and property-schema JSON are preserved; this is not a
promise to retain arbitrary unknown top-level fields.

Python is authoritative. It reports all discovered graph/compilation errors as
an `errors: string[]` alongside the joined `error` message, including duplicate
step names, duplicate function names within a step, invalid tool names, missing
references, undefined required properties, unreachable steps, and missing paths
to call-ending nodes. Cycles with exits are allowed. Explicit post-actions retain
precedence over `end`; an overridden end flag alone is not a call ending.
Every step is compiled during validation, including downstream steps.

The voice runtime uses the original `gpt-4o` through Pipecat’s existing Chat
Completions service with the original provider defaults; arbitrary model values are
rejected in Python, and `update_agent` cannot change `model`. This allowlist is a
project constraint, not a claim about every model the provider supports.
TypeScript checks shape and mutation preconditions, not a duplicate Python graph
validator. Validation runs before commit and again before voice allocation.

## State, addressing and commit boundary

React owns `agent`, `selectedNodeId`, `mode`, and a monotonically increasing
revision outside runtime JSON. Graph positions, pane state and highlights are
presentation data. Increment the revision on every successful manual save,
proposal Apply and agent switch; failed/dismissed edits do not increment it.

Transitions are addressed by `(node, function)`, never by list position. Missing
or ambiguous names fail atomically. Structural batches may have invalid
intermediate states; validate only the completed candidate. A function rename
uses its current name as the address; subsequent operations use the new
name. Deleting a referenced/start step requires repairing references in that batch.

All changes use `applyAgentOperations(agent, operations)`. It is pure, immutable
and atomic. Manual editing constructs a candidate, validates it in Python and
commits on explicit Save only if the base revision still matches. A manual draft
spans multiple steps and transitions so additions, connections and reference
repairs after deletion can be saved together. Cancel and validation/commit failures
preserve the saved agent. Selection and draft addresses remain coherent after
transition deletion or function renaming.

Copilot's proposal lifecycle is:

1. Read a request's saved-agent snapshot and base revision.
2. `propose_agent_patch` parses operations, constructs the candidate through the
   shared mutations and calls the injected Python validator.
3. Return validation errors to the model for repair, or a validated proposal
   containing operations, base revision, summary and affected graph references.
4. Show the concrete preview and validation status. Only explicit human **Apply**
   may commit the operations through the same mutation function.
5. Reject Apply when the current revision differs. A stale proposal must be
   regenerated against the current agent. Dismissal/failure leaves state unchanged.

Validation happens inside the proposal tool; there is no separate `validate_agent`
model tool. Invalid attempts can be displayed with errors but cannot be applied.
The UI enables Apply only for a successful validated tool result tied to the
request snapshot and revision; assistant prose cannot authorize a commit.

## Copilot architecture

Use the OpenAI AI SDK provider (`@ai-sdk/openai`),
with server-only `OPENAI_API_KEY` in `frontend/.env.local`. Start with `gpt-4o` as
the Copilot model, configured in the server module. Voice keeps its separate
backend environment. Deterministic tests inject a fake model/validator and need no
credentials; live evals use the actual provider. Never expose keys in public env,
logs, tool results or traces.

Each chat request carries `{ messages, agent, revision }`: the current **saved**
agent, excluding drafts, and a nonnegative revision. Parse this untrusted input.
Tools close over that request snapshot; `get_agent` returns it, not an imagined
server-side current agent. Bind proposals/results to that revision even when a
manual edit occurs while generation streams. Repeated repair attempts start from
the same snapshot, not from earlier unapproved proposals.

Keep `useChat` mounted in `BuilderShell`. Its state survives node selection,
pane visibility and Builder/Test Call mode changes. Put **Details / Copilot**
tabs inside the existing context pane so the selected step remains visible as
context while chatting. Do not add a separate chat sidebar. Agent switches
start a new conversation context and invalidate old proposals; pane changes do not.

Tools: `get_agent`, `propose_agent_patch`, and read-only `get_call`/`get_calls`. Bound model steps and duration; surface malformed/empty proposals,
validation unavailability, provider errors and stale Apply failures.

Diagnosis and proposal results carry `affected: { nodes: string[], edges:
{ node: string, function: string }[] }`. Resolve these names against the current
agent and render graph highlights outside runtime JSON. Ignore missing references
with visible feedback; never highlight a different agent using stale references.

## Workflow-specific decisions

**Workflow A:** start from a valid one-step agent:
name `New clinic agent`, initial node `start`, one `start` node with `end: true`
and a goodbye task message.
Use normal defaults. Manual authoring and generation adds/connects steps,
updates the initial node and removes or repurposes the seed atomically. Never start
with zero nodes. Both the manually built and generated results collect name/DOB,
branch for patient type, collect insurance only for new patients, and limit
Dr. Smith's new patients to
Monday/Wednesday. Include clarification, missing data, short valid answers,
corrections and early-supplied information in generation instructions.

**Workflow B:** provide an explicit labelled switch to `clinic-scheduler`
(mocked existing deployed agent) using the fixture loader. Warn before discarding
unsaved work, end any active call, reset selection/drafts and increment revision.
Calls/issues are scoped to that fixture.

**Workflow B fix scope:** repair `offer_times` instructions
and, if needed, its `select_time` description to enforce Monday/Wednesday for new patients while
preserving existing-patient scheduling. Do not add a patient-type/insurance branch
in this targeted Friday fix. The fixture already instructs conditional insurance
collection in persona/collect_details but has no explicit branch; preserve that
behavior and test that existing patients are not asked for insurance. Workflow A
supports the full branching structure through both manual authoring and generation. Do not claim the Friday patch repairs all possible weaknesses in the deployed fixture.

## Workspace interactions

Preserve the existing light graphite/white theme with graphite selection, compact
headers, thin borders and system fonts. Use the local shadcn components and shared
theme tokens. No navigation rail, separate chat sidebar, extra state/layout
library, unsupported runtime settings. Use black primary buttons and transition pills with white text, neutral gray
selection surfaces, and graphite step icons. Keep actions, focus rings, badges,
and saved states monochrome. Pointer-opened Add step has a short entrance; press feedback stays
subtle, keyboard actions stay immediate, and reduced motion disables movement.

- The header identifies the agent and holds the Builder / Test Call pill. Builder
  shows the graph with a collapsible/resizable context pane, roughly 70/30 on desktop.
  Keep graph and inspector mounted across pane/mode changes. Below 768px, Graph
  (or Call) / Details switches surfaces without losing state.
- Closing context preserves selection; selecting a node/transition reopens it.
  Clearing selection returns to agent context. Preserve the viewport while inspecting
  targets. Graph nodes support Enter/Space selection; Escape/canvas click clears it.
  Positions start from a deterministic layout and remain presentation data, with
  pan/zoom/Fit. Drag cards freely; connections follow and edits preserve positions.
  Drag a step's bottom + onto another card to connect, or drag either end of an existing arrow onto a card to change its source or target
  without changing its condition or fields. Rewire adjacent connections to move a
  step earlier or later; moving cards changes layout only. Both incoming and outgoing
  arrows have separate attachment points. Source moves carry unfinished field drafts
  to the new address and reject conflicting function names. Delete transition removes
  the arrow explicitly; dropping an existing endpoint on empty canvas cancels the gesture.
  Incoming arrows attach at separate points so converging connections can be grabbed
  individually. Cards highlight as drop targets. Dropping a new connection on empty canvas opens
  Add step there; creation places the connected step at that location. Dismissal
  leaves the agent unchanged. Dropping an existing arrow on empty canvas cancels
  rerouting. Clicking + still opens Add step and keyboard authoring remains available
  in the inspector. New canvas connections default to “When this step is complete.”
  and open the condition for editing. Connecting an ending step clears its end flag
  while preserving native post-actions. All connection gestures stage the shared
  draft; Python validation and explicit Save still gate runtime changes.
  The graph displays the shared manual draft. A canvas plus button adds a standalone
  step; users enter a readable step name and code generates unique IDs. A plus on each node adds a connected conversation or ending step. A trash
  icon beside the selected node deletes it and its incident transitions in the same
  draft. Deleting the initial step requires choosing a replacement before Save.
  Creation asks for a readable name and conversation goal; the goal becomes the
  step instructions immediately and is previewed on its card. Connections shows
  incoming and outgoing links separately, including steps with no next step yet.
  Inspector connection creation asks for a plain-language condition. All connection
  creation generates a unique tool name. Condition badges stay compact; internal function names are
  editable under Function details, never used as the graph label. Existing empty
  descriptions show Set condition so they can be repaired explicitly.
  These controls follow the graph-adjacent interaction in the ElevenLabs reference;
  the inspector holds instructions, start/end settings and transition details.
- The divider supports pointer/keyboard resizing: arrows change 2 percentage points,
  Shift+arrow 10, Home/End bounds, double-click restores 70%, Escape cancels a drag.
  Reserve 320px for desktop details and restore focus when reopening the pane.
- The inspector's General/Connections section persists between nodes. Show exact
  IDs, start/end badges, native actions, tool names and collected-field schemas.
  Start is the initial-node badge, not a separate runtime node. Voice/model are
  agent-wide read-only values; avoid unsupported per-node controls.
- The workspace initially loads the original scheduler. **Create new agent** in
  agent context starts a draft from the valid seed; Save commits it and Cancel
  restores the previous agent. Finish or cancel an existing draft before creating.
- Manual authoring supports agent name/instructions, adding/deleting steps and
  transitions, start/end behavior, function renaming, collected fields and required
  fields. Runtime voice/model settings stay read-only; preserve native payloads.
- Keep step details focused: inherited role instructions use a disclosure; voice/model
  appear only in agent context. Omit empty action/collected-field sections and repeated
  helper text. Closing Add step restores trigger focus and preserves selection.
- Goals, role overrides and transition descriptions are inline fields; routing uses
  a target select with Open target. Use agent instructions clears the role override.
  Transitions expose Information to collect as compact, clickable rows with readable
  names derived from property keys, descriptions, answer kinds and Required labels.
  String enums appear as Choice with individual option labels. Opening a row expands
  its editor in place; Add information opens the same editor for a new field.
  Text, Choice, Number, Whole number and Yes / No write only native properties and
  required. New names generate snake_case keys; existing keys change only through
  explicit editing. No extra title or UI schema is generated. Choice options use
  individual add/remove controls. Blank/duplicate keys or options show inline errors;
  switching away from Choice requires explicitly removing its options first.
  Done stages the field through the shared update_edge mutation; Save still requires
  Python validation. Rename/removal repairs required atomically. Native constraints,
  nested schemas and metadata are preserved. Unsupported schemas show Custom schema
  and remain editable in collapsed Advanced JSON; Function details is also collapsed.
  Unfinished field edits live in the editor hook, addressed by source and function,
  survive pane/selection changes and block Save until completed or canceled. Advanced
  JSON stays synchronized; invalid text is retained without replacing the last valid
  schema and blocks Save. There is no caller form or additional preview screen.
  Native structured payloads remain accessible through disclosures.
- A sticky Save/Cancel footer shows dirty, pending, saved and error states.
  Multi-step drafts survive selection/tab/pane changes; deletions and renames keep transition selection
  and draft addresses coherent. Cmd/Ctrl+Enter saves; Cancel/Escape restores
  committed values. Pending validation blocks resubmission. Refresh resets this
  session-only workspace to its fixture.
- Test Call replaces the canvas with controls and context with the live transcript.
  Returning to Builder ends the call; mobile Details does not. Cancel/end/unmount
  release microphone resources, including late permission results. Disconnected
  WebRTC may recover; failed/closed connections expose a recoverable error.
  Transcript uses final user text and playback-confirmed assistant segment progress,
  updating each segment in place. Generated but unplayed text stays hidden; playback
  timing may still differ slightly from what the caller hears. It persists until the next call or refresh.
  The transcript follows incoming speech, including updates within a segment.
  Scrolling back pauses following; Jump to latest resumes it. The log scrolls independently,
  with graphite caller bubbles and light gray agent bubbles. Test Call keeps only
  its heading, call status and action; omit explanatory notes.
- `ChatPresentation` stays controlled by the AI SDK adapter; it owns only draft,
  clipboard feedback and scroll-following. Enter sends, Shift+Enter inserts a line,
  composition does not submit, and busy/blank submission is blocked. Preserve reading
  position; Jump to latest resumes following. Stop/error states expose Retry.
  Activity shows observed events only. Disable raw HTML, unsafe links and remote
  images; contain wide Markdown locally. Copy failure permits text selection.
