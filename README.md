# Prosper Voice Agent Builder

A workspace for the two jobs that eat a voice-AI deployment team's time:

1. **Build** a working agent from a client's written guidelines.
2. **Repair** a deployed agent: find out why a call went wrong, or whether any call did, and fix it.

The graph editor and Test Call exist so a human can trust what the Copilot produces.
The Copilot is the product. Design intent and scope live in [solution.md](solution.md),
pending work in [TASKS.md](TASKS.md), and contributor workflow in [AGENTS.md](AGENTS.md).

## The idea: Copilot proposes, evidence backs it, a human applies

Most "AI builds your agent" tools edit the thing directly. Here the Copilot works like a
coding assistant in a pull-request flow:

- **It proposes, never edits.** `propose_agent_patch` submits a batch of typed operations.
  The same pure, atomic `applyAgentOperations()` that powers manual edits builds the
  candidate, and the Python `AgentBuilder` validates it (broken references, unreachable
  steps, no path to an end, compile failures). Invalid proposals cannot be applied.
- **You review a real diff.** The candidate renders on the canvas with New/Updated labels,
  with grouped global and step changes in chat and readable inline before/after diffs.
  The model’s explanation is collapsed separately. The card states “Flow is valid · Not
  tested on a call yet” because a valid graph is not proof of a good call.
- **Apply is a revision-guarded save.** It re-checks the agent ID and revision and your
  manual draft, then saves exactly the reviewed candidate. A stale proposal cannot apply.
- **Diagnosis is grounded in evidence.** Copilot reads call transcripts through
  `get_calls`/`get_call`, scoped to the active agent. Its answer cites
  `[turn 3](call:…#3)` links, and a link only renders if the same conversation holds a
  `get_call` result that really contains that turn. Anything else is shown as
  *unverified*, so the model cannot invent evidence.

## Demo script

[DEMO.md](DEMO.md) maps each demo to the brief's requirements, with the exact calls to make and what
to expect: SOP to agent, a review of the deployed agent against its SOP, repair of a flagged call,
detection of unreported issues, a live booking call with visible tool lines, and the guardrails. Start with `npm run dev` and open <http://localhost:3000>.

## What is real, mocked, and left out

| Area | Status |
| --- | --- |
| Voice (Pipecat, WebRTC, ElevenLabs, OpenAI) | Real, supplied stack unchanged |
| Agent validation and compilation | Real, Python `AgentBuilder`, shared by manual edits and Copilot |
| Copilot (tools, proposals, review) | Real, OpenAI via the AI SDK, server-side keys |
| Production calls | **Mocked.** Fourteen synthetic calls for the deployed agent behind a mock platform API (`/api/platform/…`) |
| Scheduling, patient records, eligibility | **Mocked API** (`backend/agent_builder/mock_api.py`): slots computed from today and existing bookings, double-booking refused, eligibility enforced by the API. Agents reach it through five tools; no EHR or payer integration |
| Persistence | Browser `localStorage` behind an `AgentRepository` with revision checks |
| Auth, teams, database, real call ingestion, background monitoring, analytics | Deliberately not built: none of it changes the two bottlenecks |

Why mock calls behind an API instead of importing fixtures: the UI and the Copilot tools
read calls the way they would in production (list, filter, paginate, fetch one, ownership
check). Swapping in the real platform means replacing `frontend/lib/platform/store.ts` and
its handlers.

## Evidence

`make verify` is the gate: it is deterministic and must stay green (lint, types, Python and
TypeScript unit tests, the Python/TypeScript contract check, recorded evals). `make e2e` runs the built
app in Chromium with voice and model mocked.

`make eval-copilot` is a small live smoke set that runs the real Copilot and the real Python validator on
synthetic data. It scores the tools the model actually called, not its prose. Model output varies, so it
is not a gate, and scenarios that passed and failed on identical code were removed rather than kept. It does not cover
voice quality. Scenarios: rename, targeted insurance clarification, grounded guideline review, vague
one-liner interview, SOP creation that must use the scheduling tools, Friday and slot-taken diagnosis and repair, a repair that leaves unrelated steps
alone, unflagged-call discovery, a clean call that must *not* be flagged, and a hostile instruction
inside a pasted transcript that must not be obeyed.

Conversation quality has deterministic checks too: `conversationQualityIssues()` flags a transition that can
fire before the step has collected anything, or re-asks known data.

## Setup

Requires Node 24, Python 3.11+, and [uv](https://docs.astral.sh/uv/).

```bash
nvm use
make install
```

Create `backend/.env` from `backend/.env.example` and set `OPENAI_API_KEY` and
`ELEVENLABS_API_KEY`. Next.js reads the same file for Copilot; optionally set
`COPILOT_MODEL` (default `gpt-5.5`), which does not change the voice model. Then:

```bash
npm run dev
```

This starts Next.js on 3000, the Python voice runtime on 7860, and the validation service
on 7861. Allow microphone access for Test Call (it shows the saved graph with the active step highlighted); **Ctrl+C** stops everything. Keys stay
server-side, never in `NEXT_PUBLIC_*`, fixtures, logs, or commits.

## Code map

| Path | Responsibility |
| --- | --- |
| `frontend/components/builder/` | Workspace, graph, inspector, Copilot pane, Test Call UI |
| `frontend/lib/agent/` | Parsed contract, immutable operations, proposals, local repository |
| `frontend/lib/copilot/` | Server-only model and tool loop, evidence parsing |
| `frontend/lib/platform/`, `app/api/platform/` | Mock production-call API (schema, store, handlers) |
| `frontend/lib/runtime/` | Validation, voice, and platform HTTP clients |
| `backend/agent_builder/` | Authoritative validation, compilation, current-agent call endpoint, step tools (`tools.py`) and the mock clinic API (`mock_api.py`) |
| `backend/bot.py` | Supplied Pipecat voice pipeline |
| `fixtures/`, `evals/` | Synthetic agents, guidelines, calls, SOP; eval scenarios and scoring |

## Verification

```bash
make verify   # format, lint, types, unit tests, Python/TS contract, recorded evals
make e2e      # built app in Chromium, mocked voice and model
make eval-copilot   # live Copilot evals (sends synthetic data to OpenAI; needs the validation service)
```

Run `make browser-install` once for Chromium. `evals/voice/saved-context.mjs` checks, against
running services, that Test Call executes the *saved* configuration and not an unsaved draft.
