# Prosper Voice Agent Builder

A deployment-engineer workspace for two jobs: build a voice agent from client
requirements, and diagnose and repair a failed deployed agent from call evidence.
See [solution.md](solution.md) for the intended product and architecture,
[TASKS.md](TASKS.md) for pending work and the next slice, and
[AGENTS.md](AGENTS.md) for implementation workflow.

## What the code currently does

Fresh browser storage opens a minimal agent and also saves the clinic scheduler
as **Mocked existing deployed agent**. A parsed, versioned localStorage repository
persists each agent's stable ID, revision, runtime configuration, guidelines, and
the selected agent. Malformed or unavailable storage surfaces a recoverable error;
existing data is preserved.

The React Flow builder supports step and transition editing, collected fields,
start/end semantics, dragging, and reconnecting. Graph and plain-text guideline
edits form one draft. Save applies shared structured operations, validates through
Python, and checks the saved revision immediately before persistence. Meaningful
changes increment the revision once; no-ops and graph geometry do not. Cancel
restores saved values. Switching agents protects drafts with Save, Cancel, or Keep
editing and invalidates pending validation and call callbacks. Graph positions
stay separate from runtime JSON and are retained per agent within the workspace.

Test Call captures the exact saved runtime configuration and displays its agent
ID/revision. Unsaved drafts are explicitly excluded. The same-origin route sends
the runtime payload to Python, with call status, transcript, hangup, and resource
cleanup on stop, switch, and unmount. The builder does not use the supplied
`/client`; the Python voice stack and request payload are unchanged.

The reusable chat presentation is demonstrated at `/preview/ui`; it is not a
working Copilot integration. AI SDK dependencies and an eval harness exist, but
there is no real Copilot API/tool loop or live eval adapter yet. Two clinic call
fixtures and a flagged issue fixture exist as data; there is no production-review,
proposal Apply, or automatic investigation workflow. Pending work lives only in
[TASKS.md](TASKS.md).

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
| `frontend/lib/agent/` | Parsed contracts, immutable operations, local repository, graph projection |
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

Run `node evals/voice/saved-context.mjs` against running local services to verify
saved-context persistence through the real voice runtime. It saves an identifiable
instruction, refreshes, enters a different unsaved instruction, and checks the
exact outgoing saved payload, spoken marker, and incoming audio. It uses a silent
synthetic microphone and needs no WAV fixtures. `VOICE_FRONTEND_URL` overrides
localhost:3000; results are written to `evals/results/saved-context.json`.
The saved-context scenario passed with actual provider audio during slice 1
verification. This establishes saved-context execution, not the later clinic
creation or repair conversation-quality criteria.
