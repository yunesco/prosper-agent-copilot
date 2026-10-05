# Verification

Run from the repository root after `make install`.

| Command | Responsibility |
| --- | --- |
| `make verify` | Lint, strict TS, Python syntax, unit/integration tests, contract parity, synthetic eval checks |
| `make test` | Vitest + pytest |
| `make contract` | Python/TS acceptance, normalized JSON, defaults, native-field preservation |
| `make eval-check` | Synthetic reference traces and scorer; not model quality |
| `make build` | Production Next.js build |
| `make e2e` | Production build + Chromium, real app/routes, screenshots |
| `make eval-copilot` | Actual Copilot against eval fixtures; requires adapter, credentials, network |
| `make run` | Voice runtime for manual calls; requires backend credentials and microphone |

## When to run checks

- Code changes: `make verify` once at the end.
- UI behavior changes: also `make e2e`; it already includes the production build.
- Layout changes: inspect one desktop and one mobile capture.
- Docs-only changes: review the diff; no test run needed.
- Failures: fix the cause and rerun affected checks, without repeating passed gates
  unless new changes affect them.

No mandatory Impeccable workflow, independent design review, design-document
handoff, or four-viewport capture matrix. Live model/voice checks apply only to
changes in those behaviors.

## Deterministic tests

- Colocate frontend `*.test.ts(x)`. Use `// @vitest-environment jsdom` for component
  tests; test async Server Components in Playwright. Assert behavior and failures.
- Python tests use the real `AgentBuilder`/Flows classes with a fake state owner.
  They suppress the import-time NLTK download and never start speech providers.
- Pytest blocks TCP sockets; Vitest resets a blocking fetch stub before each test.
  Inject fakes at external boundaries. These guards are not OS-level isolation.
- Extend `frontend/scripts/check-contract.ts` and `backend/tests/export_contract.py`
  when changing the wire contract. Named cases assert expected acceptance in both
  languages and compare normalized JSON directly; failures include Python reasons.
- Python owns runtime validation. The three frontend reference checks are local
  feedback. Parity covers supported inputs, not every malformed Python value or
  arbitrary action/property schema. Duplicate node names are not currently rejected.
- Register fixtures in `frontend/lib/fixtures.ts`. Tests check registry completeness,
  unique IDs, references, valid graph paths, and independent loading. Python discovers
  agent JSON files automatically. Use synthetic data only.

## Browser checks

Playwright owns a production server on port 3100 and does not reuse other servers.
Mock remote providers/voice transport; exercise real app state and routes.

The browser build sets `UI_PREVIEW=1` to exercise `/preview/ui`; normal builds
reject that route. Workspace checks cover desktop and mobile sizes, pane retention and
focus, pointer/keyboard resizing, Markdown overflow, and deterministic chat states.
Graph checks cover keyboard selection, clickable transition detail panes, transition
targets, terminal nodes, removed expansion controls, reopening on selection, clearing
selection, and viewport/selection retention across desktop and mobile pane changes.
These checks are not evidence of runtime validation, Copilot, or voice behavior.

For layout changes, use the desktop/mobile captures from `frontend/e2e/workspace.spec.ts`.
Inspect the affected screen; additional captures are optional when diagnosing a failure.
Failure traces/screenshots are retained; CI uploads evidence on success and failure.

```bash
cd frontend
npx playwright show-report
npx playwright show-trace test-results/<case>/trace.zip
npm run test:e2e -- --headed --trace on
```

Startup failures have webServer logs but no browser trace. Fix the environment and
rerun. Run build/e2e sequentially with typecheck; they share `.next` output.

## Copilot evals

Schemas and scoring: `frontend/scripts/eval-harness.ts`.

The mutation proposal tool is `propose_agent_patch`; it returns structured
operations without changing product state. The sequence is proposal → preview →
completed candidate validation → explicit human Apply → `applyAgentOperations()`
→ `AgentConfig`, using the same mutation path as manual edits.

- Fixture: `id`, `agent_id`, `prompt`, `expected` tool order/operations/approval.
- Trace: `tool_calls` with unique `toolCallId`, `toolName`, JSON `input`, and
  `result` (`{ type: 'tool-result', output }` or `{ type: 'tool-error', error }`);
  also `proposed_operations` and `applied`.
- Adapter: export `run({ prompt, agent })`, returning
  `{ model: { provider, id, settings }, trace }`. Record actual non-secret settings.

Add `evals/fixtures/<name>.json`, a synthetic reference in `evals/traces/<name>.json`,
and a regression test. Run `make verify` (which includes `make eval-check`).

The rename reference is hand-written with schematic tool payloads. It checks the
harness, not model quality or actual approval enforcement. With the real Copilot,
assert observed proposal/validation results and actual state before/after Apply.
Grade generation and diagnosis by requirements/evidence, allowing equivalent graphs.

```bash
COPILOT_EVAL_ADAPTER=frontend/path/to/adapter.ts make eval-copilot
```

Adapter paths are relative to the repo root or absolute. Invoke the actual Copilot;
never pass scoring expectations to it. Capture AI SDK `onStepEnd` / tool execution
hooks or stream events, correlate by call ID, and preserve invocation order.
Bound duration/steps using SDK controls. Do not infer execution from assistant prose.
An absent adapter fails explicitly; no mock fallback.

The runner saves fixture snapshots, responses, and failures in ignored
`evals/results/{recorded,live}.json`. It replaces stale reports at startup, saves
after each case, continues after case failures, and exits nonzero on failure.
Inspect the named failure and saved evidence; copy useful reports before rerunning.
Do not rerun live evals until a lucky pass. Keep credentials out of all evidence.

Add cases with slices 05/06/08: targeted edits, invalid/stale proposals, approval,
guideline generation, and Friday diagnosis/fix preserving existing-patient behavior.
The call fixtures belong to Workflow B's intentionally flawed `clinic-scheduler`,
a mocked existing deployed agent, not Workflow A's generated cold-start agent.
Add corrected-behavior expectations with the relevant slice.

## Voice checks

Call the running agent at `http://localhost:7860/client`. Record the scenario,
expected/observed behavior, and result in the final reply. For current-agent integration,
call again after an edit. Browser mocks and structural validation do not prove
spoken behavior. Missing live credentials/services leave that criterion incomplete.
