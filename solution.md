# How this works, and why

The brief names two things that eat the deployment team's time: **turning a client's
guidelines into an agent**, and **finding and fixing what goes wrong in production**. I built
for those two jobs and nothing else. The graph editor, validation, saved agents, call
evidence and Test Call are there so a person can trust what the Copilot hands them.

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
│                                          │   Mock platform API: 7 synthetic calls
│  Copilot server route (keys server-side) │   (list, filter, paginate, fetch one)
└──────────────────────────────────────────┘
```

## Decisions

**One saved record per agent.** It holds an ID, a revision number, the runtime JSON and
plain-text guidelines. The revision is a concurrency token, not a history feature: a stale
proposal or a stale tab cannot overwrite newer work. Graph positions and chat are not
part of the record.

**Drafts, then Save.** Manual edits are a draft until you Save; Cancel restores the saved
state. The Copilot only reads saved state, and Test Call only runs saved state, so what you
test is what you saved. Apply refuses to run on top of an unsaved draft instead of merging.

**One mutation path.** Manual edits and Copilot proposals both go through
`applyAgentOperations()`. It is pure and atomic: if any step fails, nothing changes.

**Python is the only validator.** It rejects broken references, unreachable steps, graphs that
can never end, and compile failures. TypeScript only parses shapes. Two validators would
drift, and the one that decides is the one that runs the call. If validation is
unavailable, Apply stays disabled.

**Four tools, no more.** `get_agent`, `get_calls`, `get_call`, `propose_agent_patch`. The model
reasons about a change and submits one batch of typed operations; it does not get low-level
edit tools or replacement JSON. Small surface, easy to evaluate and to trust.

**Smallest fix wins.** Repairs prefer editing one step's instructions, then one transition,
and add or remove steps only when nothing else works. A repair touches the one step at
fault and leaves the rest of the agent alone.

**The proposal is a diff you can read.** Outcome, why, behavior affected, the changed
elements highlighted in blue on the canvas, then separate sections for Python validation,
exact configuration checks and the model's own review. "Conversation checks" says *not run*
because a valid graph is not proof of a good call.

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

**Production calls are mocked behind an API.** Seven synthetic calls, served by a small
mock platform API with listing, filtering, pagination and agent-scoped lookup. The UI and
the tools use it the way they would use a real platform; swapping it in replaces one module.
Calls stay historical: a repair never rewrites them.

**Voice is untouched.** Test Call runs the saved agent through the supplied Pipecat stack
(WebRTC, ElevenLabs, OpenAI). Keys stay server-side. The Copilot runs on its own model
setting and does not change the voice model.

**Stack:** Next.js App Router (thin pages, server components by default), Tailwind and shadcn/ui,
the AI SDK for chat and tool state, React hooks for workspace state, localStorage behind
the repository, Python for validation and voice.

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
| EHR or scheduling integration | Times and bookings are simulated and the agent is told not to invent more |
| Pre-Apply replay of old calls against a candidate | The next step I would build; it would fill the "conversation checks" slot |
| Templates, import/export, cloning, PDF/knowledge-base guidelines | Pasted text covers the use case |
| Model or voice selectors, prompt playground | Not part of either job |
| Fancy graph features, mobile polish | The graph only needs to be readable and editable |

## Honest limits

- The Copilot's quality is measured by evals that score observed tool calls and cited
  turns on synthetic data. They do not measure voice quality.
- Voice behavior is shown by a few real calls (see the README's Evidence section), not
  by an automated suite.
- Persistence is per browser; two tabs writing the same agent is not coordinated.
