# Prosper Voice Agent Builder

A deployment-engineer workspace for two jobs: build a voice agent from client
requirements, and diagnose and repair a failed deployed agent from call evidence.
See [solution.md](solution.md) for the intended product and architecture,
[TASKS.md](TASKS.md) for pending work and the next slice, and
[AGENTS.md](AGENTS.md) for implementation workflow.

## What the code currently does

The current app opens the supplied scheduler in a React Flow graph. It supports
step and transition editing, collected fields, start/end semantics, graph-wide
drafts, Save/Cancel, dragging, and reconnecting. Saves use shared structured
operations and Python validation. Saved changes are currently **in memory only**;
refresh reloads the fixture. The shell has an in-memory revision guard for
concurrent validation, not a persisted agent revision or repository.

Test Call sends the current saved in-memory agent through a same-origin route to
the Python voice runtime, with call status, transcript, hangup, and resource cleanup.
It does not send the unsaved graph draft. Python validates each call configuration
and binds it to that session; the builder does not use the supplied `/client`.

The reusable chat presentation is demonstrated at `/preview/ui`; it is not a
working Copilot integration. AI SDK dependencies and an eval harness exist, but
there is no real Copilot API/tool loop or live eval adapter yet. Plain-text
guidelines, two clinic call fixtures, and a flagged issue fixture exist as data;
they are not yet an editable guidelines or production-review workflow.

There is no localStorage agent repository, saved-record identity/revision model,
agent selector, proposal Apply flow, or automatic call investigation. Existing
tests and the live-call script are implementation evidence, not a claim that the
new end-to-end demo stories have passed. This inventory comes from code/test
inspection; no tests or live calls were run for this documentation update.

## Setup

Requires Node 24, Python 3.11+, and [uv](https://docs.astral.sh/uv/).

```bash
nvm use
make install
```

Create `backend/.env` from `backend/.env.example` if it does not already exist.
Set `OPENAI_API_KEY` and `ELEVENLABS_API_KEY`, then run:

```bash
npm run dev
```

This starts Next.js on port 3000, the Python voice runtime on 7860, and the
validation service on 7861. Open [localhost:3000](http://localhost:3000), allow
microphone access for Test Call, and press **Ctrl+C** to stop the services.

Server-side `AGENT_RUNTIME_URL` and `VOICE_RUNTIME_URL` can override the frontend
routes' default backend addresses. Keep credentials server-side, never in
`NEXT_PUBLIC_*`, fixtures, logs, or commits. Copilot provider setup will be
documented with its implementation; the current voice credentials do not imply a
working Copilot.

## Code ownership

| Area | Responsibility |
| --- | --- |
| `frontend/components/builder/` | Workspace, graph, inspector, drafts, Test Call UI |
| `frontend/lib/agent/` | Parsed TS contract, immutable operations, graph projection |
| `frontend/lib/runtime/` | Validation and voice HTTP/transport clients |
| `frontend/app/api/runtime/` | Thin same-origin validation and call handlers |
| `backend/agent_builder/` | Authoritative validation, compilation, current-agent call endpoint |
| `backend/bot.py` | Supplied Python voice pipeline and integration |
| `fixtures/` | Synthetic clinic agent, guidelines, call evidence, and issue data |
| `backend/example_flow.json` | Supplied original scheduler, consumed directly |
| `frontend/components/chat/` | Reusable chat presentation, currently preview-only |
| `evals/` and `frontend/scripts/` | Synthetic eval fixtures/traces, scoring harness, live-call script |

## Verification

```bash
make verify   # lint, types/syntax, deterministic tests, Python/TS contract, recorded eval checks
make e2e      # built app in Chromium; mocked voice, no live model/voice services
make build    # production frontend build
```

Run `make browser-install` once if Chromium is missing. UI behavior changes also
require e2e; layout changes require one desktop and one mobile screenshot review.
Docs-only changes require diff review, not the code gates.

`make eval-copilot` requires `COPILOT_EVAL_ADAPTER` pointing to an actual Copilot
adapter exporting `run(input)`. It currently fails without that implementation.
`make eval-check` only checks the synthetic recorded trace/scoring harness and is
not a model quality score.

`evals/voice/live-call.mjs` is an existing provider-backed browser call script for
an edited original scheduler. It requires running services, Chromium, and
`VOICE_AUDIO_DIR` containing the synthetic WAV utterances referenced in the script;
`VOICE_SCENARIO` selects `booking` or `correction`. Its scenario-specific assertions
do not establish the new clinic creation/repair stories. Relevant Copilot/voice
changes need a real eval or actual call; missing services leave live acceptance
incomplete. Use synthetic patient data throughout.
