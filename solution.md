# Prosper Voice Agent Builder — Solution Overview

## Overview

The core problem is not building a graph editor. The graph is just the representation Prosper already uses to run agents.

The real deployment work happens in two places:

1. **Initial deployment** — turning a client's natural-language guidelines into a working voice agent.
2. **Production iteration** — understanding why calls fail, deciding what should change, and updating the agent safely.

My solution focuses on those two workflows and treats the graph editor as the interface for inspecting and manually adjusting the generated agent.

The product has three connected surfaces:

- **Builder** — a node graph for the current agent.
- **Test Call** — a live voice call against the current graph.
- **Copilot** — an AI agent that can inspect the current configuration, create or modify the graph, inspect mocked production calls, and propose fixes.

The demo connects two related workflows through the same Builder, Test Call, and
Copilot surfaces:

```text
Workflow A — Initial deployment

client guidelines
→ Copilot generates agent
→ inspect / manually adjust
→ live test call
```

```text
Workflow B — Production iteration

existing mocked deployed agent
+ flagged production call
→ Copilot diagnoses issue
→ proposes targeted fix
→ review + Apply
→ retest
```

Workflow B uses the intentionally flawed checked-in `clinic-scheduler` fixture as
a mocked existing deployed agent. Its Friday failure belongs to that fixture,
not to the correctly generated cold-start agent from Workflow A. The demo makes
this context switch explicit while keeping the same editing and testing surfaces.

---

## Product decisions

### The Copilot is the main feature

Phase 1 is necessary, but I am deliberately keeping the graph editor minimal. The challenge is more interesting if the deployment engineer spends less time manually constructing graphs in the first place.

The graph still matters because it makes the generated agent visible, inspectable, and editable.

### The AI edits the same agent the human edits

There should not be a separate "AI-generated" representation.

Manual edits and approved Copilot proposals both modify the current `AgentConfig` through `applyAgentOperations()`. Proposed changes are visible for review before they affect product state.

### Changes are proposed as structured operations

The Copilot should not return a blob of JSON and ask the UI to replace the whole agent.

Instead it proposes explicit operations such as:

```text
add_node
update_node
delete_node
add_edge
update_edge
delete_edge
update_agent
```

Those operations can be shown to the user before they are applied.

This gives the interaction the useful part of a coding agent workflow:

```text
inspect → understand → propose → preview → validate candidate → explicit human Apply
```

rather than behaving like a generic chatbot beside the graph.

### Human approval stays in the loop

For the demo, the Copilot can diagnose and prepare changes, but meaningful edits are applied explicitly by the deployment engineer.

That keeps the interaction understandable and makes the before/after change easy to demonstrate.

---

## Scope

### Build

- node graph editor;
- node and transition editing;
- live browser test call;
- Copilot integrated into the builder;
- natural-language agent creation;
- natural-language agent modification;
- mocked production call history / flagged issues;
- Copilot diagnosis of a problematic call;
- proposed agent changes with an explicit Apply step.

### Mock

- production call history;
- client-reported issues;
- a few realistic successful and failed calls;
- scheduling / backend behavior where a real integration is unnecessary for the demo.

### Intentionally leave out

- authentication and organizations;
- database infrastructure;
- real production analytics pipelines;
- clustering thousands of calls;
- EHR integrations;
- deployment/versioning infrastructure;
- autonomous production changes;
- a large evaluation framework;
- a general healthcare rules engine.

These are real production concerns, but they do not help prove the main product idea within an 8–12 hour take-home.

---

## Architecture

I keep Prosper's existing Python/Pipecat voice runtime rather than rewriting it.

```text
┌──────────────────── Next.js / React ────────────────────┐
│                                                         │
│  React Flow builder        Context panel                │
│          │                       │                      │
│          └────── AgentConfig ────┘                      │
│                    ↑                                    │
│                    │                                    │
│             Copilot / AI SDK                            │
│                    │                                    │
│          structured agent operations                    │
│                                                         │
│               Test Call UI                              │
│                    │                                    │
└────────────────────┼────────────────────────────────────┘
                     │ WebRTC
                     ▼
┌──────────────── Existing Python / Pipecat ──────────────┐
│                                                         │
│  AgentConfig JSON → AgentBuilder → Pipecat Flow         │
│                                      │                  │
│                              STT → LLM → TTS             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Frontend

- **Next.js + TypeScript** — application shell and Copilot API.
- **React Flow** — graph visualization and editing.
- **Vercel AI SDK** — streaming Copilot UI, tool calls, and structured AI interactions.
- **Plain React state** — enough for the current scope; no separate state library unless the implementation actually becomes complex enough to justify one.
- **Tailwind / shadcn** — only where useful for moving quickly.

### Voice runtime

The supplied Python backend remains responsible for:

- Pipecat;
- WebRTC voice session;
- ElevenLabs STT/TTS;
- LLM execution;
- compiling `AgentConfig` into a runnable Pipecat Flow.

The main backend change is simply allowing the UI's current agent configuration to be used for a test call instead of relying on a fixed example JSON file.

---

## State and mutations

The canonical product state is intentionally small:

```text
agent
selectedNodeId
mode
```

AI SDK manages the conversational/tool-call state. React owns the product state.

The important abstraction is one shared mutation path:

```ts
applyAgentOperations(agent, operations) => updatedAgent
```

Both the manual editor and approved Copilot proposals use it. The Copilot path is:

```text
Copilot
→ propose_agent_patch
→ preview
→ validate candidate
→ explicit human Apply
→ applyAgentOperations()
→ AgentConfig
```

Candidate construction uses the same pure operations without committing product
state. The completed candidate is validated before the user clicks Apply; only
then are the approved operations committed. There is no second AI-specific
mutation path.

---

## Copilot tools

The Copilot gets a deliberately small set of capabilities.

### `get_agent`

Reads the current `AgentConfig` so the model can reason about the actual implementation before proposing changes.

### `propose_agent_patch`

Produces one or more structured proposed agent operations. The tool does not mutate product state directly.

Example:

> Existing patients should skip insurance collection.

The Copilot may propose:

```text
- update the patient-type transition
- route existing patients directly to scheduling
- keep insurance collection only on the new-patient path
```

The UI shows the proposal, validates the completed candidate, and waits for the user to explicitly click **Apply**. `applyAgentOperations()` commits the approved operations to the current agent.

### `validate_agent`

Checks that the completed candidate is structurally runnable before Apply. The current agent is validated again before a test call.

### `get_call`

Returns a mocked production call with transcript, outcome, graph path, and optional client feedback.

This gives the Copilot enough context to connect a production problem back to the current agent configuration.

### Optional: `get_calls`

If time allows, this can expose a small set of mocked calls so the Copilot can identify a repeated failure pattern. It is not required for the core demo.

---

## Demo flow

The demo proves both workflows with shared clinic guidelines and the same builder
surfaces, while clearly identifying which agent is current.

### Workflow A — Initial deployment

Paste clinic instructions such as:

> Collect name and DOB. New patients also need insurance. Dr. Smith only sees new patients Monday and Wednesday.

The Copilot proposes the initial graph through structured operations. The user
previews the proposal, validates the completed candidate, and clicks **Apply**.

The user can inspect the nodes and manually adjust the agent if needed, then
switch to Call mode and place a live test call against that generated agent.

### Workflow B — Production iteration

Explicitly switch to the intentionally flawed checked-in `clinic-scheduler`,
labeled as a **mocked existing deployed agent**. Open its mocked flagged call,
where a new patient was incorrectly offered a Friday appointment. This call did
not come from the agent generated in Workflow A.

Ask the Copilot why it failed. The Copilot inspects the call, the current fixture
agent, and the clinic guideline, identifies the missing scheduling restriction,
and highlights the relevant part of the graph.

The Copilot proposes a targeted fix through `propose_agent_patch`. The user
reviews the preview, the completed candidate is validated, and the user clicks
**Apply**. `applyAgentOperations()` commits the approved operations and the graph
updates immediately.

Run another live test call against the corrected fixture agent to show that it
now follows the intended rule.

---

## Why this scope

The highest-value demo is not a feature-complete builder. It is showing that a deployment engineer can go from:

```text
Initial deployment: guidelines → generated agent → live test call
Production iteration: mocked deployed agent + flagged call → reviewed fix → retest
```

with substantially less manual graph editing and debugging.

Everything in the implementation is chosen to support these connected workflows. Anything that does not materially strengthen it is intentionally deferred.
