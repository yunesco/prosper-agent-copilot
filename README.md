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
  with a before/after list underneath. Validation, exact configuration checks, and the
  model's own explanation are shown separately, and "conversation checks: not run" is
  stated plainly because a valid graph is not a good call.
- **Apply is a revision-guarded save.** It re-checks the agent ID and revision and your
  manual draft, then saves exactly the reviewed candidate. A stale proposal cannot apply.
- **Diagnosis is grounded in evidence.** Copilot reads call transcripts through
  `get_calls`/`get_call`, scoped to the active agent. Its answer cites
  `[turn 3](call:…#3)` links, and a link only renders if the same conversation holds a
  `get_call` result that really contains that turn. Anything else is shown as
  *unverified*, so the model cannot invent evidence.

## Demo script (about 4 minutes)

Start: `npm run dev`, open <http://localhost:3000>.

**A. Guidelines to agent.** On *New / generated agent*, open Copilot, paste
[`fixtures/demo-sop.md`](fixtures/demo-sop.md), and ask it to build the agent. Preview
the blue-labelled workflow on the canvas, **Apply**, tweak a step by hand, **Save**,
then **Test Call** (real voice, runs the saved agent).

**B. Repair from a complaint.** Switch to *Mocked existing deployed agent*. In Details →
Recent calls open *Reported Friday booking issue* and press **Investigate with Copilot**.
It reads the transcript, cites the turn where Friday is offered to a new patient, links
the responsible step (`offer_times`), and proposes the smallest fix. Preview, **Apply**,
**Test Call** the repaired revision. The historical transcript stays unchanged.

**C. Detection.** Press **Review recent calls with Copilot**. Nobody flagged
*Existing-patient Monday booking*, but the agent asked an existing patient for
insurance, against the guidelines. Copilot reads every call, flags that one with cited
turns, does not accuse the clean calls, and offers the same repair flow.

## What is real, mocked, and left out

| Area | Status |
| --- | --- |
| Voice (Pipecat, WebRTC, ElevenLabs, OpenAI) | Real, supplied stack unchanged |
| Agent validation and compilation | Real, Python `AgentBuilder`, shared by manual edits and Copilot |
| Copilot (tools, proposals, review) | Real, OpenAI via the AI SDK, server-side keys |
| Production calls | **Mocked.** Five synthetic calls behind a mock platform API (`/api/platform/…`) |
| Scheduling availability | **Simulated** in instructions, no provider integration |
| Persistence | Browser `localStorage` behind an `AgentRepository` with revision checks |
| Auth, teams, database, real call ingestion, background monitoring, analytics | Deliberately not built: none of it changes the two bottlenecks |

Why mock calls behind an API instead of importing fixtures: the UI and the Copilot tools
read calls the way they would in production (list, filter, paginate, fetch one, ownership
check). Swapping in the real platform means replacing `frontend/lib/platform/store.ts` and
its handlers.

## Evidence

`make eval-copilot` runs the real Copilot and the real Python validator on synthetic data
and scores observed tool calls, not prose. On 2026-10-06 with `gpt-5.5` all nine scenarios
passed: rename, targeted insurance clarification, grounded guideline review, combined
review changes, two SOP creations, Friday diagnosis and repair (reads the call, cites turns
3–5, patches only `offer_times`), unflagged-call discovery, and a clean call that must *not*
be flagged. Voice behavior is not covered by these evals; see [TASKS.md](TASKS.md).

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
on 7861. Allow microphone access for Test Call; **Ctrl+C** stops everything. Keys stay
server-side, never in `NEXT_PUBLIC_*`, fixtures, logs, or commits.

## Code map

| Path | Responsibility |
| --- | --- |
| `frontend/components/builder/` | Workspace, graph, inspector, Copilot pane, Test Call UI |
| `frontend/lib/agent/` | Parsed contract, immutable operations, proposals, local repository |
| `frontend/lib/copilot/` | Server-only model and tool loop, evidence parsing |
| `frontend/lib/platform/`, `app/api/platform/` | Mock production-call API (schema, store, handlers) |
| `frontend/lib/runtime/` | Validation, voice, and platform HTTP clients |
| `backend/agent_builder/` | Authoritative validation, compilation, current-agent call endpoint |
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
