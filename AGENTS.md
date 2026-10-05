# Agent instructions

Read `solution.md`, `README.md`, `TASKS.md`, `EVALS.md`, then the selected slice's
code/tests. `solution.md` owns scope; this file owns workflow. Keep docs accurate.

## Boundaries

- Implement one requested slice. No auth, organizations, database, EHR, production
  analytics/ingestion, deployment/versioning, autonomous changes, or rules engine.
- Preserve `backend/bot.py`'s voice stack. `backend/agent_builder/` owns Python
  validation/compilation; `frontend/lib/agent/` owns the TS contract and mutations.
- Keep App Router pages/handlers thin; default to Server Components. Runtime HTTP
  clients belong in `frontend/lib/runtime/`; implement/test matching Python endpoints.
  The supplied `/client` does not accept the builder's current agent.
- React hooks own `agent`, `selectedNodeId`, and `mode`; AI SDK owns chat/tool state.
  Keep graph positions/selection outside runtime JSON. No extra state library.
- Use same-origin Copilot APIs; keep models/credentials server-side and voice in Python.
- Use synthetic `fixtures/` and `backend/example_flow.json` directly; no duplicate sample.

## Changes and data

- `propose_agent_patch` proposes only: preview → Python candidate validation →
  explicit human Apply → shared `applyAgentOperations()`. Manual edits use the same path.
- Mutations must be pure, immutable, and atomic; failures leave the agent unchanged.
- Use strict TS and parse untrusted JSON; never cast to `AgentConfig`. Preserve
  snake_case, defaults, and native payloads. Separate effects from domain logic.
- Lock npm/uv dependencies; preserve voice-stack versions. Avoid unused abstractions.
- Never expose keys in `NEXT_PUBLIC_*`, logs, fixtures, traces, or commits.

## UI

- Read `UX.md` and `PRODUCT.md` when relevant. Preserve settled decisions and use
  existing components. No mandatory design interview, alternative concepts, skill
  workflow, independent design review, or design-document handoff.
- **Use Tailwind CSS + shadcn/ui.** Use the standard local shadcn components directly;
  do not build parallel button APIs or wrappers. CSS files only hold Tailwind setup,
  shared theme tokens, and required library styles. Inline styles only serve dynamic
  geometry/library APIs.
- Skills are optional: use one only when it materially helps the requested work.
  Install only dependencies the slice needs. Update `UX.md` when interactions change.

## Verification

1. Check git status, preserve unrelated edits, and implement the requested slice with
   focused behavioral and negative-path tests.
2. Run `make verify` once after code changes. For UI behavior changes, also run
   `make e2e`. For layout changes, inspect one desktop and one mobile screenshot.
   No mandatory four-viewport matrix or separate review agents.
3. If a check fails, fix the cause and rerun affected checks. Repeat the full gate
   only when subsequent changes affect it. Docs-only changes need a diff review.
4. For Copilot or voice behavior changes, run the relevant live eval or actual call.
   Deterministic tests use injected fakes; never start providers/bot for unit tests.
   Missing live services leave live criteria incomplete; mocks are not live evidence.
5. Review the diff for scope, secrets, contract drift, and unintended dependency changes.
   Report checks concisely. Keep `TASKS.md` pending-only: remove completed work;
   never append logs or history.
