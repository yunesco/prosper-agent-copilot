# Prosper Voice Agent Builder

Build, test, and improve healthcare voice agents with a graph editor and embedded
AI Copilot. [`solution.md`](solution.md) defines the product and architecture.

Read [`AGENTS.md`](AGENTS.md) for engineering rules, [`TASKS.md`](TASKS.md) for
current status and acceptance criteria, and [`EVALS.md`](EVALS.md) for verification.
See [`UX.md`](UX.md) for implemented pane behavior, shared controls, visual rules,
and the planned agent interactions.
The builder loads the original scheduler for graph inspection and validated instruction/transition editing.
Edits stay in memory for the current page session.

## Local setup

Run commands from the repository root. Requires Node 24, npm, Python 3.11+, and
[uv](https://docs.astral.sh/uv/getting-started/installation/).
`.nvmrc` selects Node 24; `backend/.python-version` selects Python 3.11.

```bash
nvm use              # nvm install first if Node 24 is missing
make install         # installs root launcher, frontend, and Python dependencies
```

The voice backend reads `backend/.env` automatically. If it does not exist, copy
`backend/.env.example` to `backend/.env` and fill in:

```dotenv
OPENAI_API_KEY=your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key
```

Keep an existing `.env`; do not overwrite it. It is Git-ignored. The frontend and
deterministic checks do not need provider keys.

## Start everything

```bash
npm run dev
```

`concurrently` starts all three services with labeled logs:

| Service | URL | Current behavior |
| --- | --- | --- |
| Frontend | http://localhost:3000 | Scheduler graph with validated node/transition editing |
| Validation API | http://localhost:7861/docs | Python candidate validation (no voice session) |
| Voice backend | http://localhost:7860/client | Existing scheduler with microphone/WebRTC |

Open the voice client, connect, allow microphone access, and talk. It loads
`backend/example_flow.json`; calls use the configured OpenAI and ElevenLabs accounts.
The frontend validates edits through a same-origin API backed by Python on port 7861.
Set server-only `AGENT_RUNTIME_URL` to override that address. Current-agent Test Call and Copilot arrive in later slices. Test Call is explicitly
unavailable in the builder shell.

Press **Ctrl+C** to stop all three services. If any process exits, the others are stopped.
`make dev` is an alias for the same combined command.

To run only one service:

```bash
npm run dev:web       # frontend only
npm run dev:voice     # voice backend only (also: make run)
npm run dev:validation # validation only; needed to save builder edits
```

If startup reports a port in use, stop the existing server and retry. To use a
different frontend port on macOS/Linux, run `PORT=3001 npm run dev`. For missing
modules, rerun `make install`. For voice connection failures, inspect the `voice`
logs and check provider credentials and browser microphone permission.

## Verification

```bash
make verify           # lint, types, tests, contract parity, synthetic evals
make browser-install  # install Chromium once
make e2e              # production build + browser tests on port 3100
make help             # all Make commands
```

Linux browser setup: `cd frontend && npx playwright install --with-deps chromium`.
Stop the frontend dev server before production build/e2e checks; run build/e2e
sequentially with typecheck because they share `.next` output. Browser tests own
their frontend and Python validation servers (ports 3100 and 7862) and do not require `npm run dev` or live provider calls.

`make eval-copilot` is reserved for live model checks once the real adapter exists;
keys alone do not enable it. See [`EVALS.md`](EVALS.md) for detailed verification.

## UI presentation preview

For isolated component QA, run `UI_PREVIEW=1 npm run dev:web` and open
`http://localhost:3000/preview/ui`. Stop any existing frontend first.
This preview uses labeled synthetic messages, manual streaming chunks, activity
states, and a Demo data / Worst case switch. It does not call providers or edit an
agent. Normal builds return 404 for this route; the browser suite explicitly
opts in during its build. Do not enable this flag for a normal product build.

## Code map

| Path | Responsibility |
| --- | --- |
| `backend/bot.py` | Pipecat/WebRTC voice runtime |
| `backend/agent_builder/` | Python contract, validation, compilation |
| `frontend/app/` | Next.js pages and HTTP handlers |
| `frontend/lib/agent/` | TypeScript schema and shared immutable operations |
| `frontend/lib/fixtures.ts` | Synthetic fixture loading |
| `frontend/scripts/` | Contract checks and eval runner |
| `frontend/e2e/` | Browser flows and screenshots |
| `fixtures/` | Agents, guidelines, calls, issues |
| `evals/` | Eval fixtures, reference traces, ignored results |

Use the stack and boundaries in `solution.md`: Next.js, React Flow, AI SDK,
plain React state, mandatory Tailwind CSS/shadcn UI, and the existing Python runtime.
Implement runtime HTTP clients in `frontend/lib/runtime/` with their corresponding
Python endpoints. `/api/health` reports frontend liveness.
