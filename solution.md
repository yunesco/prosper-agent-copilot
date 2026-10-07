# How this works, and why

The brief names two things that eat the deployment team's time: **turning a client's
guidelines into an agent**, and **finding and fixing what goes wrong in production**. I built
for those two jobs and nothing else. The graph editor, validation, saved agents, call
evidence and Test Call are there so a person can trust what the Copilot hands them.

## What I optimised for

A deployment team onboarding a new client: they read the client's public site and SOP, then need
a working agent for *that* client's use case. Prosper's own public material lists scheduling,
eligibility and benefits verification, billing, prior authorization and claims follow-up, with
escalation to humans ([primary care page](https://www.getprosper.ai/outpatient-groups/primary-care),
[a16z](https://a16z.com/announcement/investing-in-prosper-ai/)). So the Copilot builds agents
that **act through tools, not through data pasted into prompts**.

- Steps can call tools (`tools` on a step): `check_availability`, `book_appointment`,
  `lookup_patient`, `verify_eligibility`, `transfer_to_human`. They run against a mocked clinic API
  whose answers are computed from today's date and what is already booked, so availability is never
  hardcoded, booking a slot removes it, and a taken slot returns a real 409.
- Scheduling is built end to end. Eligibility and transfer prove the same pattern holds for a second
  use case; claims, balances, prior auth and SMS are one registry entry each and are not built.
- The Copilot knows the catalog. For something no tool covers it builds what the tools allow, says
  what is missing, and uses `transfer_to_human`. It never invents a tool.
- Where it would plug in: `mock_api.py` is the only file that pretends to be an EHR or payer.
- Nothing in the graph is hardcoded. No instruction, persona or enum carries a clock time: a proposal that
  writes one gets a quality warning (`hardcodedTimeIssues`), the seeded Riverside agent and the minimal test
  fixture both use the tools, and the create-from-SOP eval fails a candidate that books without
  `check_availability` and `book_appointment`. Days of the week stay in the text only as policy (which patient
  type may book which day); the API enforces the same policy independently.

## What the demo proves

In the order you would watch it:

1. **Build from an SOP** into a lean graph that uses tools and has no times in any instruction.
2. **Review a shipped agent.** The deployed Riverside agent is imperfect on purpose: the SOP has
   five rules it silently misses (emergency, callback number, patient lookup, insurance check,
   confirmation read-back). Review quotes each rule and names the step at fault. The flaws are
   planted and listed here, so the result is reproducible, not cherry-picked.
3. **Every fix gets a card.** Fix requests force the Copilot to end in a proposal; if it cannot, the
   UI says why and offers Retry instead of leaving prose.
4. **Detect from calls.** Without being told, it finds the five failures nobody reported (chest pain while the
   agent kept booking; a taken slot the agent confirmed anyway; a Friday offered to a new patient; a time that was
   never offered; a day Dr. Smith does not work) with verified turn citations, and leaves the clean calls alone.
5. **Repair a flagged issue** with the smallest patch.
6. **Test Call is real.** Tool calls show in the transcript (`book_appointment → confirmed A101`),
   the booked slot disappears on the next call, and a new patient asking for Friday is refused by the API.

The Copilot's work log reads like a short report, not a spinner: "Riverside: 7 steps, 2 using tools",
"14 calls: 6 failed, 1 reported by the client", "Valid: 9 changes across 5 steps".

## The one idea

An AI that edits your agent is scary, because a valid-looking graph can still be a bad call.
So the Copilot works like a coding assistant in a pull request:

1. It **proposes** a change. It never saves anything itself.
2. The change is checked by the **same Python code that runs the voice agent**.
3. You see the result **on the canvas** as a diff, with the reasons.
4. You press **Apply**. That is the only way anything is saved.

For production issues, the Copilot also has to **show its evidence**. It reads real
transcripts and cites turns. If it cites a turn it never read, the UI shows it as
*unverified*.

## Picture

```
 Browser (Next.js)                                   Python backend
┌──────────────────────────────────────────┐        ┌───────────────────────────┐
│  Graph + Details       Copilot chat      │        │  agent_builder/           │
│  (manual edits)        (AI SDK)          │        │   validate + compile      │
│        │                    │            │        │   (the only validator)    │
│        │ same pure          │ tools      │        │                           │
│        ▼ operations         ▼            │ check  │  bot.py                   │
│   applyAgentOperations()  get_agent      ├───────►│   Pipecat voice stack     │
│        │                  get_calls      │        │   (supplied, untouched)   │
│        │                  get_call       │        └─────────────▲─────────────┘
│        │                  propose_patch  │                      │ Test Call
│        ▼                                 │                      │ (saved agent)
│  AgentRepository (localStorage)  ◄── Apply, revision-checked ───┘
│   id · revision · agent JSON · guidelines│
│                                          │   Mock platform API: 14 synthetic calls
│  Copilot server route (keys server-side) │   (list, filter, paginate, fetch one)
└──────────────────────────────────────────┘
```

## How a Copilot request flows

1. **The browser sends a structured request.** The saved agent snapshot (ID, revision, JSON,
   guidelines), the chat messages and the intent go to `/api/copilot`. The server parses it with
   zod and rejects anything malformed or stale (`parseCopilotRequest`).
2. **The model gets tools, not free rein.**
   - `get_agent` is forced as the first call (`toolChoice`).
   - The only way to change anything is `propose_agent_patch`. Its input is a zod schema
     (`patchInputSchema`), and each operation (`add_node`, `update_edge` and so on) is a typed
     union.
   - The model can't emit replacement JSON or a new tool.
3. **The server builds the candidate itself.** `constructProposal` applies the operations with
   `applyAgentOperations`. That function is pure and atomic, and any failure leaves the agent
   unchanged. The Python backend then validates the result (`validateAgent`), because it is the
   authority.
4. **The model never saves anything.** The human sees a preview and clicks Apply. Only then does
   a revision-checked save happen.
5. **The review is structured too.** The model's quoted excerpts must be one of the guideline
   sentences, and the references must exist in the graph.

**Why this design.** The model is good at deciding *what* to change and bad at being reliable
about *how* a change is applied, so it only does the first. Everything after its decision is
ordinary code we can test:

- *It can't invent a different way to build an agent.* The tool and operation schemas are the
  whole vocabulary. A hallucinated tool, field or replacement JSON fails parsing before anything
  happens, instead of being interpreted.
- *Copilot edits and manual edits share one boundary.* Both go through
  `applyAgentOperations()` and the Python validator, so Copilot can never produce something a
  person couldn't, and one set of tests covers both.
- *A bad proposal is an error, not a corrupted agent.* Operations are pure and atomic, validation
  runs before preview, and a validation error goes back to the model for at most two corrections.
- *Trust stays with the human.* The model has no save capability. Apply is explicit and
  revision-checked, so a stale or wrong proposal is rejected rather than overwriting newer work.
- *Quoted evidence is real.* Constraining excerpts to the guideline text and references to
  existing graph elements means a review can't cite something that isn't there.

The AI SDK supplies the plumbing (schema-to-tool conversion, the tool loop, streaming to the
chat UI), not the safety. The safety comes from our schemas, pure operations and Python
validation, which would hold with any client. What the model still decides is the content of a
proposal (which steps, enums and wording), which is why conversation-quality checks and live
evals exist, and why a preview and human Apply stay in the loop.

## Decisions

**One saved record per agent.** It holds an ID, a revision number, the runtime JSON and
plain-text guidelines. The revision is a concurrency token, not a history feature: a stale
proposal or a stale tab cannot overwrite newer work. Graph positions and chat are not
part of the record.

**Drafts, then Save.** Manual edits are a draft until you Save; Cancel restores the saved
state. The Copilot only reads saved state, and Test Call only runs saved state, so what you
test is what you saved. Apply refuses to run on top of an unsaved draft instead of merging.

**Test Call shows the graph.** During a call the saved graph stays on screen next to the live
transcript. Steps appear as the call reaches them and the current one is marked *Live*. The voice
runtime reports each transition as an RTVI server message (`node-active`) on the existing data
channel; the first step is implied by `bot-ready`. Each agent line is labelled with the step that
generated it. Tool calls arrive the same way (`tool-call`) and show as their own line in the
transcript, for example `book_appointment → confirmed A101: Monday, October 12 at 9:00 AM`, or the
error when a slot was taken.

**One mutation path.** Manual edits and Copilot proposals both go through
`applyAgentOperations()`. It is pure and atomic: if any step fails, nothing changes.

**Python is the only validator.** It rejects broken references, unreachable steps, graphs that
can never end, and compile failures. TypeScript only parses shapes. Two validators would
drift, and the one that decides is the one that runs the call. If validation is
unavailable, Apply stays disabled.

**Progress is read from the stream, not guessed.** While the Copilot works, the status line names the
current phase (thinking, reading the agent or a call, writing the graph with a live step count, checking
with the validator, writing the summary) and an elapsed timer. Every label comes from an actual stream
event; the model's own reasoning text is not shown. When a step finishes, the work log says what it
found ("14 calls: 6 failed, 1 reported by the client"), built from the real tool output.

**A fix request always ends in a card.** The "Propose all changes" and "Propose change" buttons (now on
ambiguous findings too, using the most reasonable reading and saying so) tell the server to expect a
proposal. After a few reads the Copilot is forced to call `propose_agent_patch`. If it still cannot
produce a valid change, the UI shows a *No change proposed* card with the reason and Retry, never silence.

**Four Copilot tools, no more.** `get_agent`, `get_calls`, `get_call`, `propose_agent_patch`. (Voice agents have their own
step tools, described above. The Copilot only *assigns* them; it cannot call them.) The model
reasons about a change and submits one batch of typed operations; it does not get low-level
edit tools or replacement JSON. Small surface, easy to evaluate and to trust.

**Lean graphs, designed from first principles.** The Copilot is told to draw the smallest state machine that
runs the call: one step per stage (typically 3 to 6, never more than 8), one transition per real way forward
(never more than 3), and the whole-call rules (corrections, off-topic, "I don't know", stopping) written once in
the agent's persona and not as extra steps or transitions. A step is already a loop that holds until its
required fields are valid, so enums and required fields do the insisting. These rules follow published practice
for conversation-flow agents (few transitions, happy path first, global rules in the global prompt). A
size warning on the proposal flags a bloated graph, and the live evals score it.

**Smallest fix wins.** Repairs prefer editing one step's instructions, then one transition,
and add or remove steps only when nothing else works. A repair touches the one step at
fault and leaves the rest of the agent alone.

**The proposal is a diff you can read.** The chat card shows the outcome and compact
Global changes and Step changes rows with readable names and factual summaries. View
expands each row’s readable before/after diff inline, with real line breaks and no JSON
syntax; Why these changes discloses the explanation and behavior affected. Each existing
or added step has one contextual canvas action that focuses it; the candidate remains
highlighted in blue on the canvas. One Dismiss / Apply footer acts on the whole validated
proposal. A quiet line says the flow is valid and has not been tested on a call yet, because
a valid graph is not proof of a good call.

**Three ways in.**
- *Build:* paste an SOP and get a full workflow, or start from nothing and the Copilot
  interviews you (at most five questions with defaults) before building. Vague SOPs get
  questions, not guesses.
- *Repair:* open a flagged call, press Investigate, get the cited cause and a targeted fix.
- *Detect:* ask it to review recent calls. It reads every transcript, including ones
  nobody flagged, reports the one real violation and leaves clean calls alone. It is on
  demand, not a background monitor.

**Conversation quality is more than graph validity.** The runtime can only enforce what a
transition requires, so a transition without required fields lets the agent move on too early.
Quality checks cover that (and re-asking for known data), the Copilot's instructions require
short answers, corrections and remembering early information, and live calls prove the rest.

**Production calls are mocked behind an API.** Fourteen synthetic calls for the deployed agent, served by a small
mock platform API with listing, filtering, pagination and agent-scoped lookup. The UI and
the tools use it the way they would use a real platform; swapping it in replaces one module.
Calls stay historical: a repair never rewrites them.

**Voice is untouched.** Test Call runs the saved agent through the supplied Pipecat stack
(WebRTC, ElevenLabs, OpenAI). Keys stay server-side. The Copilot runs on its own model
setting and does not change the voice model.

**Stack:** Next.js App Router (thin pages, server components by default), Tailwind and shadcn/ui,
the AI SDK for chat and tool state, React hooks for workspace state, localStorage behind
the repository, Python for validation and voice.

## What is real, what is mocked

| Real | Mocked |
| --- | --- |
| Voice stack, graph compiler, Python validator, Copilot, proposals, Apply, Test Call | Production calls (14 written by hand) |
| Tool calling inside a live call: the model decides, the handler runs, the result is spoken | The clinic systems behind the tools: `mock_api.py`, in memory |
| Rules the API enforces: new patients Monday and Wednesday only, no double booking | The patient list, insurance plans and the "existing load" on Dr. Smith's calendar |

## Assumptions

- The reader is a deployment engineer who has a client's SOP and wants a first working agent today.
- A human reviews every change. Speed comes from the Copilot doing the reading and wiring, not from skipping review.
- Data that lives in a clinic system (times, patient records, plan acceptance) must come from a tool at call time. If it is
  written in a prompt it goes stale, and the Copilot is told not to do it.
- Scheduling is the main case. Other use cases should be one tool entry each, not a new product.
- The deployed demo agent misses five SOP rules on purpose: emergencies, callback number, patient lookup, insurance check and a
  full confirmation. They are there so Review has real findings to show.

## What I did not build, and why

Everything below is a real product need. None of it reduces the two bottlenecks, so I
spent the time on the Copilot.

| Not built | Why |
| --- | --- |
| Auth, users, teams, roles | A single-user demo gains nothing from them |
| Database, queues | localStorage behind a repository is enough to prove the revision model; the interface is the same |
| Real call ingestion, analytics, dashboards | The mock API shows the shape; the hard part is *reading* calls, not storing them |
| Background monitoring and alerts | Detection is on demand; a monitor needs real traffic to be meaningful |
| Autonomous changes | The human Apply step is the point |
| Version history, rollback, deployment pipeline | Revisions are concurrency tokens only; production release is a separate problem |
| Rules engine or behavior DSL | Guidelines stay plain text; the model compares them to the graph |
| EHR, payer and IVR integrations | Mocked behind one module (`mock_api.py`); the tool contract is real, the backend is not. More tools (claims, balances, prior auth, SMS, cancel) are one registry entry each |
| Pre-Apply replay of old calls against a candidate | The next step I would build; it would fill the "conversation checks" slot |
| Templates, import/export, cloning, PDF/knowledge-base guidelines | Pasted text covers the use case |
| Model or voice selectors, prompt playground | Not part of either job |
| Fancy graph features, mobile polish | The graph only needs to be readable and editable |

## Honest limits

- Persistence is per browser; two tabs writing the same agent is not coordinated.
- Tool results come from a canned, in-memory mock. They are realistic in shape (computed slots, 409s,
  plan-specific copays) but are not a real EHR, and tool calls were exercised by unit tests and
  live Copilot runs, not by a recorded voice call in this repo.
- The 14 production calls are text written by hand and show what the agent said, not the tool calls behind it
  (their times come from the days before availability was computed). Reading them is what the Copilot is
  tested on; they are not a replay of the current revision.
- The voice stack is the supplied one. In a noisy room, manual-commit STT can stall when background noise keeps
  the VAD open and no transcript is committed; the fix (noise suppression, ElevenLabs VAD commit, a re-prompt on
  empty turns) is a voice-pipeline change I left out. Demo in a quiet room with headphones.
- Fix requests are forced to propose; a vague free-text chat message is still allowed to answer in prose.
