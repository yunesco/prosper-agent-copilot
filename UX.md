# Builder UX

The graph is the primary workspace for one current agent. `solution.md` owns
product scope. This document records the planned interaction design. Slice 01
has not been implemented. The selected build path is code-led; no mockup round
is required before the next authorized implementation session.

## Direction contract — final workspace

- **Thesis:** An operator inspects a conversation path, then its precise instructions
  in a contextual companion pane. Mode: Operate.
- **Own-world:** Graphite neutrals, light workspace, teal selection,
  compact headers, thin borders, and restrained controls. A desktop tool used
  alongside clinic documents in ordinary office lighting.
- **Story:** Identify the current agent, follow its path, select a step, read its
  task and follow an outgoing transition without leaving the agent.
- **First viewport:** Compact identity/mode header; graph occupies roughly 70% of
  the workspace, inspector the remainder. Four compact nodes in a vertical path,
  labeled connectors, zoom/fit at bottom left once Slice 02 connects the agent.
  Slice 01 establishes those regions with honest empty content. No app navigation rail.
- **Form:** User-specified graph plus contextual right pane using portable layout
  primitives. Signature interaction: selection connects a
  highlighted node/path to its detail pane without moving the canvas. Immediate
  state changes; short color feedback only, no staged entrance animation.
- **Finish:** unreviewed and undocumented is unfinished; this build ends with the
  finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Shell and navigation

Slice 01 establishes the UI system, shell, navigation, panes, and reusable chat
presentation. Slice 02 connects the agent and graph; Slice 03 adds editing.

- The header identifies the current agent and contains Builder / Test Call mode
  navigation. Builder is active; Test Call is unavailable until Slice 04.
- Pane controls resize, expand/restore, and close/reopen context. Closing context
  preserves the selected node; clearing selection returns to agent-level context.
- On narrow screens, Graph / Details switches the visible surface while preserving
  the mounted graph and selection. Restore focus predictably when returning.
- Add future destinations only when their slices exist: mocked call/issue context
  belongs to Slice 07. No empty dashboard, account menu, chat-history navigation,
  or redundant rail around a single-agent workspace.
- Keep a future Copilot session alive across node, pane, and mode changes. Its
  context follows the current task; it is not a separate destination or application.

## Agent inspection — Slice 02

- Default pane shows agent persona, runtime metadata, and a compact node index.
- Select a graph node or index item to see all task messages and outgoing
  transitions. Function names and node IDs remain exact; headings humanize names.
- Selecting a transition target opens that node. The graph keeps its viewport.
- Escape or the pane's back control returns to agent context. Keyboard selection
  is available on graph nodes and ordinary pane buttons. Zoom and Fit are named.
- Pointer and keyboard resizing use a shared accessible divider. Layout state
  never enters runtime JSON. Pane content scrolls independently.
- Below 768px, Graph / Details switches surfaces without discarding their state.
- Builder is active. Test Call is disabled and explicitly labeled unavailable.
  There is no fake call UI, chat input, editing action, or Apply button.

## Preserve when adding later slices

- Builder / Test Call changes mode in the same agent, preserving graph context.
- One contextual pane: agent/Copilot when unselected; node editor and contextual
  Copilot actions when selected; controls/transcript during a call; evidence and
  relevant graph context when inspecting a mocked issue. Never add a permanent,
  separate generic chat sidebar. Keep graph mounted across pane changes.
- A proposal is distinct from committed state: highlight affected elements,
  concise before/after or operation summary, completed-candidate validation,
  explicit Apply / Dismiss. Pending, invalid, failed, and stale proposals cannot
  commit. `propose_agent_patch` never mutates; approved changes share
  `applyAgentOperations()` with manual edits.
- Clearly label the later mocked deployed fixture switch. Its call evidence does
  not belong to the initial-deployment agent.

## Library and reuse decisions

**Required styling stack: Tailwind CSS + shadcn/ui.** Use Tailwind utilities for
layout, spacing, typography, states and responsive behavior; compose shadcn/ui
components for generic controls. Keep CSS limited to Tailwind setup, shared theme
tokens and required library base styles. No standalone component stylesheets.
shadcn/ui integration is planned, not installed or wired in this preparation pass.

React Flow is already installed and owns graph interaction (outside the curated
Pick UI Library list). `clsx` is the curated choice for conditional classes.
Lucide supplies consistent interface icons. Use shadcn/ui buttons and compatible
accessible primitives for the implemented controls. For later tasks, prefer
shadcn/ui menus/dialogs and its Sonner integration for transient notifications;
use Motion only if actual layout/exit animation warrants it. Do not introduce a
parallel standalone component system based on a library recommendation.
No Zustand: the product explicitly assigns state to ordinary React hooks. No
layout engine, command menu, virtualizer, or second drag system for four nodes.

Reuse local pane headers, the accessible divider, button/focus conventions, and
light theme tokens. Keep the shell specific to one agent; omit multi-resource
routing, persistent layout stores, account navigation, and backend chat persistence.
Product reference: [ElevenLabs Agent Workflows](https://elevenlabs.io/docs/eleven-agents/customization/agent-workflows).
Use its flow clarity and progressive disclosure, not a visual clone.

## Local preparation completed

Local primitives are prepared but not yet wired into the application:

| Local file | Reuse / adaptation |
| --- | --- |
| `frontend/components/panes/PaneHeader.tsx` | Header, title, and action slot; direct `clsx` import removes the external formatting dependency |
| `frontend/components/panes/PaneDivider.tsx` | Pointer capture, arrow-key resizing, bounds, reset, and cancel behavior |
| `frontend/components/panes/pane-split.ts` | Pure split bounds/clamping only; no persistence store |
| `frontend/components/ui/Button.tsx` | Reference for sizing, focus, pending and disabled behavior; reconcile with shadcn/ui Button before use |
| `frontend/components/ui/focus.ts` | Shared focus outline and reduced-motion-aware press treatment |
| `frontend/components/ui/theme.css` | Light semantic tokens, elevation and timing; no dark theme or animated effects |

`clsx` and `lucide-react` are direct, locked dependencies for these primitives.
The theme is intentionally not imported yet. No page, graph, inspector, mode
control, or product behavior has changed. The current split defaults are generic;
set the graph/inspector proportions during implementation and verify their bounds.

## Additional components planned

- Pane workspace composition: split, expand/restore, close/reopen, responsive
  switching, and retained component identity. Adapt it to one agent and one
  contextual companion; do not import an unrelated resource-routing controller.
- Chat presentation: conversation scrolling/jump-to-latest, composer/send/stop,
  streaming Markdown, copy/retry states, and collapsible activity/status display.
  Preserve required license notices; adapt generic controls to shadcn/ui.
- Activity must describe actual events from the Copilot tools, with honest pending,
  completed, and failed states. Use supported public summaries; do not invent a
  reasoning transcript or tool execution evidence.
- Extract presentation from domain-specific cards, saved history, attachments,
  account/session persistence, and unrelated tools. Use the existing AI SDK for
  Copilot state/transport in Slice 05. Preparing reusable files does not implement
  or expose working Copilot in Slice 01; synthetic presentation previews stay in
  an isolated development/test surface.

## Slice 01 implementation plan — not executed

1. Follow the required Impeccable and Emil skill workflows. Set up shadcn/ui in
   the existing Tailwind stack. Reconcile local buttons, tokens, and focus rules.
2. Build a thin App Router shell with identity/content slots and Builder / Test Call
   navigation. Use honest empty content; Test Call remains disabled. No fixture
   loading, graph projection, agent editor, calls, or AI integration in this slice.
3. Adapt the reusable pane composition for a primary workspace and contextual
   companion: resize, expand/restore, close/reopen, narrow-screen switching,
   independent scrolling, mounted-content retention, and predictable focus.
   Keep layout state local; do not introduce domain routing or persistence.
4. Prepare the reusable chat presentation in an isolated development/test preview:
   composer, streaming Markdown, scroll-to-latest, copy, send/stop, retry/error,
   and collapsible working/tool-status components. Drive it with labeled synthetic
   events; provider transport and actual tools belong to Slice 05.
5. Verify the shell and component states, then document the actual reviewed visual
   system in `DESIGN.md`. Do not implement Slice 02 as part of this work.

## Verification by slice

For Slice 01:

- Test pane resizing bounds, pointer cancellation, expand/restore, close/reopen,
  content retention, keyboard focus, navigation, and unavailable Test Call.
- Preview empty, pending, streaming, stopped, failed, and completed chat presentation
  states using deterministic events. Check long content and reduced-motion behavior.
- Capture and inspect 1440×900, 1280×800, 1024×768, and 390×844. Check pane minimum
  sizes, independent scrolling, focus visibility, and horizontal overflow.
- Run `make verify` and `make e2e`, inspect diagnostics/traces, follow the bounded
  design review, and report verification in the final reply. Keep previews out of product flow.

For Slice 02:

- Test pure projection of all four nodes/three transitions, stable identities,
  branching, initial/terminal flags, structured/empty messages, and unchanged runtime
  JSON. Positions/selection never enter `AgentConfig`.
- Select `collect_details`, read its full messages and `record_details` →
  `offer_times`, follow the target, inspect the terminal node, and clear selection.
- Verify keyboard selection, pan/zoom/Fit, viewport retention across pane actions,
  desktop/narrow layouts, and no console errors. Run both verification gates again.

For both, review diffs for duplication, unnecessary abstractions, contract drift,
secrets, locks, and later-slice behavior. Screenshot capture alone is not review.

`DESIGN.md` is deferred until a rendered system has been reviewed. The intended
rules are restrained graphite surfaces, teal focus/selection, compact system-font
UI text, thin dividers, and modest corner radii. They remain design intent until
verified in the actual interface.
