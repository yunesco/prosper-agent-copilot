# Product

## Platform
web

## Users
Deployment engineers configuring healthcare voice agents in an internal tool.

## Product purpose
Inspect and adjust one runnable agent, test it by voice, and use contextual Copilot
proposals to turn clinic guidelines and mocked call evidence into reviewed changes.

## Workspace vision

- A nodes canvas is the primary workspace.
- A pill-shaped switch in the top header changes between Builder and a live voice-call view.
  Keep it in the header for now.
- The right contextual pane follows the left: node editing forms or call transcripts.
- Agent Copilot handles initial agent creation/editing and refinement from client
  flags or issues it surfaces from call data. Detecting problems is itself a user
  burden; Copilot should help find them, not require every issue to be pre-flagged.
- Demo detection uses the supplied mocked calls, with evidence and human review.
  Production ingestion and autonomous agent changes remain outside scope.

## Constraints
`solution.md` is authoritative for product scope; `AGENTS.md` owns engineering
workflow and `TASKS.md` owns slice boundaries. This file is a design-context pointer,
not a competing specification. Slice 01 establishes the UI foundation; Slice 02 adds read-only graph inspection.
