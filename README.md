# Prosper Voice Agent Builder

Build, test, and improve healthcare voice agents with a graph editor and embedded
AI Copilot. [`solution.md`](solution.md) defines the product and architecture.

Read [`AGENTS.md`](AGENTS.md) for engineering rules, [`TASKS.md`](TASKS.md) for
pending acceptance criteria, and the [verification section](#verification) below
for checks and eval procedures. Workspace interactions live in `solution.md`.
The builder loads the original scheduler for graph inspection and validated instruction/transition editing.
Edits stay in memory for the current page session. Test Call runs the saved graph
through the existing Python voice pipeline and shows a live transcript.

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
| Frontend | http://localhost:3000 | Graph editing and current-agent Test Call |
| Validation API | http://localhost:7861/docs | Python candidate validation (no voice session) |
| Voice backend | http://localhost:7860/client | Existing scheduler with microphone/WebRTC |

Open the voice client, connect, allow microphone access, and talk. It loads
`backend/example_flow.json`; calls use the configured OpenAI and ElevenLabs accounts.
The frontend validates edits through a same-origin API backed by Python on port 7861.
Set server-only `AGENT_RUNTIME_URL` to override that address. Test Call sends the
saved graph through `/api/runtime/call` to Python's `/test/offer`; set server-only
`VOICE_RUNTIME_URL` to override the voice backend (default `http://127.0.0.1:7860`).
Save edits, select **Test Call**, allow microphone access, then **Start call**.
**End call** or returning to Builder releases the microphone and closes the session.
Each call validates and snapshots the saved agent; unsaved drafts are excluded.
Speech recognition is explicitly English for this clinic demo. The supplied
Pipecat interruption behavior is unchanged.
Graph selection and drafts survive mode changes. The current frontend needs no
provider key; backend credentials stay in its separate `.env`. Copilot's
server-only credential configuration is defined in [`solution.md`](solution.md).
Deterministic checks remain credential-free.

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

On a python.org macOS installation, `CERTIFICATE_VERIFY_FAILED` from both NLTK
and ElevenLabs can mean Python's root-certificate setup is incomplete. Finish
[Python's certificate installation](https://docs.python.org/3/using/mac.html#installation-steps)
by running `/Applications/Python 3.11/Install Certificates.command` (match your
Python version), then restart the services. This restores Python's default trust
store; do not disable TLS verification. Check the interpreter used by the backend:

```bash
backend/.venv/bin/python -c 'import ssl; print(ssl.get_default_verify_paths()); print(ssl.create_default_context().cert_store_stats())'
```

A missing `cafile`/`capath` and zero CA certificates indicates missing trust roots.
The virtual environment uses its base Python installation's OpenSSL trust paths.

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
keys alone do not enable it. Check selection and completion rules live in `AGENTS.md`.

### Tests and fixtures

Colocate frontend unit/component tests; use jsdom for components and Playwright
for async Server Components. Python tests use the real builder/Flows classes with
fake state and suppress the import-time NLTK download. Pytest blocks TCP sockets;
Vitest blocks fetch by default. Inject fakes at external boundaries.

For contract changes extend `frontend/scripts/check-contract.ts` and
`backend/tests/export_contract.py`: compare normalized JSON directly so reparsing
cannot hide drift. Python is authoritative; TS shape checks are not graph validation.
Playwright exercises real app/routes and Python validation, mocking providers and
voice transport. Layout captures come from `frontend/e2e/workspace.spec.ts`.
Inspect failures from `frontend/` with:

```bash
npx playwright show-report
npx playwright show-trace test-results/<case>/trace.zip
```

All fixture names, dates, insurance details and calls are synthetic. Register new
fixtures in `frontend/lib/fixtures.ts`; loaders return independent values and tests
check IDs, relationships and paths. Python discovers `fixtures/agents/*.json`.
Guidelines link by agent ID; issues link calls, guidelines and nodes. The Monday
call succeeds despite exposing the same flawed offer as the Friday call. Preserve
that evidence; never edit failed-call fixtures merely to make evals pass.

### Copilot and voice evaluations

Schemas/scoring live in `frontend/scripts/eval-harness.ts`. Add an eval fixture in
`evals/fixtures/`, a synthetic reference in `evals/traces/` and a regression test.
`make eval-check` checks the harness only, not model quality or real approval.

The live adapter exports `run({ prompt, agent })`, wraps the shared Copilot loop
with an initial revision, and returns `{ model: { provider, id, settings }, trace }`.
Capture actual non-secret settings and SDK tool events in order, correlated by
`toolCallId`, including inputs, results/errors, proposals and approval state. Never
infer execution from prose or pass scoring expectations to the model. Test actual
state before/after Apply, validator errors/repair, revisions and graph references.

```bash
COPILOT_EVAL_ADAPTER=frontend/path/to/adapter.ts make eval-copilot
```

Adapter paths are repo-relative or absolute. A missing adapter fails without a
mock fallback. The runner saves snapshots/responses/failures in ignored
`evals/results/{recorded,live}.json`, replaces old reports at startup, saves after
each case and continues after failures before exiting nonzero. Inspect failures;
copy useful evidence before rerunning. Do not rerun until a lucky pass.

For actual voice checks use the frontend's Test Call against the saved agent,
including a new call after an edit. Check English transcription and supplied
interruption behavior. Record scenario, expected/observed behavior and failures
under ignored `evals/results/`; report live limitations explicitly. Browser
mocks and structural acceptance do not prove spoken behavior or close live criteria.
Pending behavioral scenarios and workflow-specific acceptance criteria live only in `TASKS.md`.

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
