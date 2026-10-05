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

## UI — required for every feature

- Follow [Impeccable new-work](https://impeccable.style/docs/new-work/) and the relevant
  [Emil Kowalski skills](https://github.com/emilkowalski/skills). Read and execute their
  instructions, including context, craft floor, and review; report missing skills.
- Read `UX.md`, `PRODUCT.md`, and `DESIGN.md` when present. Preserve settled decisions;
  show materially different directions before implementation. Slice 01 is code-led.
- **All styling uses Tailwind CSS + shadcn/ui.** Reuse/adapt local primitives within
  that system. No competing component kit, CSS Modules, CSS-in-JS, or component CSS.
  CSS files only hold Tailwind setup, shared theme tokens, and required library styles;
  inline styles only serve dynamic geometry/library APIs.
- Use `pick-ui-library` for dependencies and applicable motion/resilience/mobile skills.
  Install only what the slice needs. Keep interactions in `UX.md` and reviewed visual
  rules in `DESIGN.md`. Planning-only requests do not authorize UI implementation.

## Verification

1. Check git status, preserve unrelated edits, read acceptance criteria, mark the slice
   in progress, and implement only its scope with behavioral/negative-path tests.
2. Run `make verify`. Deterministic tests use injected fakes; never start providers/bot.
3. UI: run `make e2e`; inspect rendered screenshots at desktop/narrow widths, overflow,
   keyboard/focus, and relevant states. Follow the bounded design review/fix process.
4. Copilot: update evals and run live `make eval-copilot`. Voice: deterministic tests
   plus an actual call. Missing services/keys leave live criteria incomplete;
   synthetic traces are not live evidence.
5. Inspect failures/diagnostics/traces, fix causes, rerun affected checks and final gate.
   Never weaken or skip failing checks.
6. Review working/staged diffs and untracked files for scope, secrets, contract drift,
   duplication, dead code, locks, and artifacts. Report verification in the final reply.
   Keep `TASKS.md` pending-only: remove completed work; never append logs or history.
