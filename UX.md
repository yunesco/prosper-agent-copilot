# Builder UX

The graph is the primary workspace for one current agent. `solution.md` owns
product scope. This document records the implemented foundation and planned agent interactions.
The shell and read-only agent inspection are implemented. Continue directly from the existing components and settled direction.

## Direction contract — final workspace

- **Thesis:** An operator inspects a conversation path, then its precise instructions
  in a contextual companion pane. Mode: Operate.
- **Own-world:** Graphite neutrals, light workspace, teal selection,
  compact headers, thin borders, and restrained controls. A desktop tool used
  alongside clinic documents in ordinary office lighting.
- **Story:** Identify the current agent, follow its path, select a step, read its
  task and follow an outgoing transition without leaving the agent.
- **First viewport:** Compact identity header with the Builder / Test Call pill; graph occupies roughly 70% of
  the workspace, inspector the remainder. Four compact nodes in a vertical path,
  labeled connectors, and zoom/fit at top left. No app navigation rail.
- **Form:** User-specified graph plus contextual right pane using portable layout
  primitives. Signature interaction: selection connects a
  highlighted node/path to its detail pane without moving the canvas. Immediate
  state changes; short color feedback only, no staged entrance animation.

## Shell and navigation

Slice 01 establishes the UI system, shell, navigation, panes, and reusable chat
presentation. The original scheduler is connected to the graph and inspector; Slice 03 adds editing.

- The header identifies the current agent. A pill-shaped Builder / Test Call switch
  sits in the top header for now. Builder is active; Test Call is unavailable until Slice 04.
- The right pane follows the workspace: node editing forms in Builder, live transcripts
  in Test Call. Copilot supports initial creation/editing and subsequent refinement.
- The inspector is a collapsible, resizable side pane; full-width expansion is removed. Closing context
  preserves the selected node; clearing selection returns to agent-level context.
- On narrow screens, Graph / Details switches the visible surface while preserving
  the mounted graph and selection. Restore focus predictably when returning.
- Add future destinations only when their slices exist: mocked call/issue context
  belongs to Slice 07. No empty dashboard, account menu, chat-history navigation,
  or redundant rail around a single-agent workspace.
- Keep a future Copilot session alive across node, pane, and mode changes. Its
  context follows the current task; it is not a separate destination or application.

## Agent inspection — implemented

- Default pane shows agent persona, runtime metadata, and a compact node index.
- Select a graph node or index item to see all task messages and outgoing
  transitions. Node cards show an icon, humanized title, and two-line preview from actual task messages.
  General shows the conversation goal with one Advanced details disclosure for
  exact node IDs, role inheritance, agent-wide model/voice, actions and native payloads; Transitions shows descriptions, targets, and exact tool names.
  The selected section persists between conversation nodes.
- Black transition pills display the backend tool description. Clicking a pill opens
  its own inspector with source/target navigation, function-call type, description,
  function name, readable collected fields and required indicators, with the full
  native field schema behind a disclosure.
- Selecting a transition target opens that node. The graph keeps its viewport. Selecting a node or transition reopens a collapsed inspector.
- Escape or the pane's back control returns to agent context. Keyboard selection
  is available on graph nodes and ordinary pane buttons. Zoom and Fit are named.
- Graph nodes use Enter/Space to select; Escape or clicking the canvas clears selection.
  Pan by dragging the canvas; use wheel/pinch or named Zoom controls and Fit.
  Positions are deterministic presentation data; nodes cannot be dragged or connected.
  Structured messages retain their full JSON display; empty messages and terminal
  nodes have explicit empty states. Rendering does not establish runtime validity.
- Pointer and keyboard resizing use a shared accessible divider. Layout state
  never enters runtime JSON. Pane content scrolls independently.
- Below 768px, Graph / Details switches surfaces without discarding their state.
- Builder is active. Test Call is disabled and explicitly labeled unavailable.
  There is no fake call UI, chat input, editing action, or Apply button.

### Backend-supported reference adaptation

The ElevenLabs reference was inspected across Greeting, Collect Patient Info,
Schedule Appointment, Cancel or Reschedule, Wrap Up, Start, End, and transition
panes. Conversation nodes share a pane structure; their goal and outgoing edges
change. Start and End have smaller type-specific panes; transition pills open
source/destination and condition details.

Our Start badge represents `initial_node`, not an extra runtime node. Terminal
nodes retain their task messages; `end` supplies an end-conversation action only
when explicit post-actions are absent. Native pre/post-actions and the terminal flag are inspectable even when empty or false.
Role inheritance/overrides and full native message payloads remain accessible.
Model and voice are agent-wide read-only values. There are no unsupported
per-node overrides, LLM-condition routing modes, edge priority controls, knowledge
base, tests, or turn-taking settings. Transition descriptions are tool descriptions,
not a separate condition engine. This slice still does not edit or validate via HTTP.

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
The stock shadcn/ui Base Nova Button and Textarea use the shared theme through standard semantic token mappings.

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

## Reusable foundation

The shell uses these local components:

| File | Responsibility |
| --- | --- |
| `components/builder/BuilderShell.tsx` | Current agent and selection state, identity, Builder mode, unavailable Test Call |
| `components/panes/PaneWorkspace.tsx` | 70/30 split, close/reopen, mobile switching, scroll and focus retention |
| `components/panes/PaneDivider.tsx` | Pointer capture, cancellation, keyboard resize, bounds and reset |
| `components/ui/Button.tsx` | Stock shadcn/ui Base Nova Button; no custom button wrapper or API |
| `components/ui/textarea.tsx` | Stock shadcn/ui Base Nova Textarea |
| `components/ui/theme.css` | Light semantic tokens shared through Tailwind |
| `components/chat/ChatPresentation.tsx` | Controlled messages/status/callbacks, local draft and scroll-following only |

The divider uses Left/Right (2 percentage points), Shift + Left/Right (10),
Home/End (bounds), double-click (70% default), and Escape/pointer cancellation
(restore the pre-drag split). Details reserves at least 320px at desktop widths;
the default split adjusts to that minimum. Both panes remain mounted when hidden.
Close/reopen restores the most recently focused content control, falling
back to the pane itself. Focus restores in the React commit, without delayed focus
stealing from the next keyboard action. Below 768px, Graph / Details switches the
visible surface. Layout state stays local and never enters runtime JSON.

## Chat presentation

`ChatPresentation` accepts messages, activity entries, a status, and send/stop/retry
callbacks. The future AI SDK adapter owns conversation and tool state. The component
owns only its draft, clipboard feedback, and scrolling. Enter sends trimmed text;
Shift + Enter adds a line; composition events never submit. Blank input and sending
while busy are blocked; a draft remains editable during streaming.

Markdown uses `react-markdown` and `remark-gfm`, with raw HTML disabled, unsafe URLs
filtered, remote images omitted, and wide code/tables locally scrollable. This task
is outside Pick UI Library's curated list. CVA supplies typed control variants;
`clsx` and `tailwind-merge` compose Tailwind classes. No motion or state library was added.

When reading older messages, updates do not move the reader. Jump to latest resumes
following. Activity expands inline and describes supplied events only; it never
invents private reasoning. Errors and stopped responses expose Retry. Copy failures
provide a text-selection fallback.

The opt-in `/preview/ui` route exercises empty, pending, streaming, stopped, failed,
and complete states with synthetic messages. The manual Next chunk control makes
streaming deterministic. Demo data / Worst case injects long names, multilingual
text, unbroken addresses, Markdown tables/code, and a long independently scrolling
workspace through ordinary props. It is outside product navigation and returns 404
unless `UI_PREVIEW=1` is set when building or starting development. No provider calls,
agent fixtures, mutations, saved chats, or session persistence are connected.

## Verification

Follow `AGENTS.md`: `make verify` for code, `make e2e` for UI behavior, and one
desktop/mobile visual check for layout changes. Keep regression coverage for pane
retention, keyboard/focus, resize/cancel, unavailable Test Call, chat recovery, and
overflow. No mandatory skill workflow, external design review, or DESIGN.md handoff.

## Visual rules

Use the existing light semantic tokens in `components/ui/theme.css`: graphite text,
white companion pane, near-white workspace, teal selection/focus, system-font UI
text, and thin dividers. Use stock shadcn/ui controls and standard token mappings;
selection-specific classes belong to the consuming surface. Pane changes are
immediate. No extra motion or state library, navigation rail, or shipping raster assets.
