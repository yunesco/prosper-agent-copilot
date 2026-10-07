# Demo plan

How to show the app so each requirement in [brief.md](brief.md) is visibly met. The brief asks
for a minimal UI to create an agent and place a test call, and a Copilot that automates two
manual workflows: **initial implementation** and **production iteration, including detecting
the issues**. Reviewers weigh the Copilot most, then problem resolution, scoping, product
sense and a live demo. The order below follows that.

## What each demo proves

| # | Demo | Brief requirement | The point to land | Time |
| --- | --- | --- | --- | --- |
| 1 | SOP to agent, then a real call | Create an agent, test call, initial implementation | Hours of translating guidelines become a reviewed proposal and a call | 3 min |
| 2 | Same call, existing patient | Branching graph, real runtime | The graph has real branches and the voice runs them | 1 min |
| 3 | Review a shipped agent against its SOP | Initial implementation, iteration | The deployed agent looks fine but misses five SOP rules; Review finds each with a quote | 2 min |
| 4 | Investigate and repair | Production iteration | Cited evidence, smallest fix, human Apply, then a live call books for real | 3 min |
| 5 | Detect an unreported issue | "Even the detection is a burden" | It finds a violation nobody flagged and does not accuse clean calls | 2 min |
| 6 | Interview from nothing | Initial implementation, vague input | It asks only what it needs, offers defaults, then builds | 2 min |
| 7 | Guardrails | Judgment, trust | Nothing changes without review; ambiguity gets questions, not guesses | 1 min |
| 8 | Manual edit | Edit the node graph | A small but complete builder; same validation path as the Copilot | 1 min |
| 9 | Scoping | Pragmatic scoping | What was left out and why | 1 min |

Run 1 to 5 for a 10 to 12 minute session. 6 to 9 are short add-ons; use them if asked. If time
is very short, do 1, 4 and 5.

## Before you start

- `backend/.env` has `OPENAI_API_KEY` and `ELEVENLABS_API_KEY`. Run `npm run dev` and open <http://localhost:3000>.
- Use a fresh browser profile or clear site data, so the saved agents are the seeded ones.
- Allow the microphone once, headphones on (otherwise the agent hears itself), quiet room.
- Do one throwaway Test Call beforehand to warm up the voice runtime.
- Have `fixtures/demo-sop.md` open to copy.
- Run `make verify` and `make eval-copilot` once earlier, so you can say they pass without waiting.

## Demo 1: SOP to agent, then a real call

**Purpose.** The first deployment workflow. Show a client document turning into a runnable agent.

1. Pick **Add agent** in the selector and name it. You get a blank agent.
2. Open **Copilot**, paste `fixtures/demo-sop.md`, and write: *Build the agent from this SOP.*
3. Say what is happening while it works: it reads the agent, then submits one batch of
   operations. It cannot save.
4. Show the proposal. Point at the blue **New** labels on the canvas, the **Why** and
   **Behavior affected**, then the validation section. Say that "conversation checks: not run"
   is deliberate, since a valid graph is not a good call.
5. Click **Apply**. The guidelines were saved with the agent too.
6. Click **Test Call** and speak this script. It also exercises the quality rules:

   > "Hi, I'm Jane Doe, I'd like an appointment." *(gives the name early)*
   > "January fourth, nineteen ninety." "I'm a new patient." "Aetna."
   > "Can I come Friday?" *(should be refused, with Monday or Wednesday offered)*
   > "Monday." "Actually, Wednesday." *(correction)* "Yes."

**Expect:** asks for DOB without re-asking the name, collects insurance, offers only Monday
or Wednesday, explains why Friday is not available, honors the correction, repeats name, day
and time, then ends the call.

**Say:** "This used to be a person reading an SOP and wiring a flow. Here it is a proposal
I can inspect, and the call runs the exact saved revision."

## Demo 2: the branch, on the same agent

**Purpose.** Prove the graph branches in the real runtime, not just on the canvas.

Call again: "John Smith, March third, nineteen eighty-five. I'm an existing patient."
Then "Friday works."

**Expect:** never asks for insurance, offers Monday, Wednesday and Friday, books Friday.

**Say:** "Same agent. New patients are limited to two days and asked about insurance. Existing
patients skip insurance and get Friday. That rule lives in the graph."

## Demo 3: review the shipped agent against its SOP

**Purpose.** The agent already runs and looks right. Show the Copilot finding what a person would
only find after an incident.

1. Switch to **Riverside Family Clinic** (tagged *Deployed*). Its offer steps call
   `check_availability` and `book_appointment`; no time is written in any instruction.
2. Open **Copilot** and click **Review behavior**.
3. Expect five potential mismatches, each with the saved SOP quote and the step at fault: no
   **emergency** rule, no **callback number**, existing patients never verified with
   `lookup_patient`, insurance never checked with `verify_eligibility`, and a one-line
   **confirmation**.
4. Click **Propose all changes** (or **Propose change** on one finding). Show the proposal; every fix
   request ends in a proposal card, or an explicit *No change proposed* card with a reason and Retry.
5. Preview, then **Apply**. Open the Copilot's work log: each step says what it found.

**Say:** "The flaws were planted so you can reproduce them. Every finding quotes the client's
own SOP, and I approve the fix."

## Demo 4: investigate and repair

**Purpose.** The second workflow: from a complaint to a verified fix.

1. In **Details > Recent calls** open **Friday booked for a new patient**. Show the numbered
   transcript and the linked graph steps. Click **Investigate with Copilot**.
2. Show the answer: it read the call, cites turns (click one, it opens the transcript at that
   turn), and names `offer_new_patient_times` as the cause. Point out that a citation only renders as a
   link if the Copilot actually read that turn.
3. Show the proposal: one step changed, nothing else. Preview, then **Apply**.
4. Test Call as a new patient and ask for Friday, then book Monday or Wednesday.

**Expect:** the transcript shows `check_availability` and `book_appointment` lines. The mock scheduling
API, not the prompt, enforces that a new patient has Monday and Wednesday only. Call again: the slot you booked is gone.

**Say:** "Cited cause, smallest patch, I approved it, and the same call now passes. The old
transcript stays as it was; we do not rewrite history."

## Demo 5: detection, the part of the brief people overlook

**Purpose.** "Even the detection of these issues is a burden." Nobody reported anything here.

1. On the deployed agent, press **Review recent calls with Copilot**.
2. Expect it to flag the failed calls nobody reported: **Caller describes chest pain, agent keeps booking**,
   **Slot taken during booking, agent confirms anyway**, **New patient asks about Friday**,
   **Caller asks for a time that was never offered** and **Existing patient booked a day Dr. Smith
   does not work**. Show a cited turn.
3. Point out what it did not flag: the clean bookings, **Friday request correctly declined**,
   **Existing patient mentions new insurance** (the agent only noted it, which is allowed) and
   the out-of-scope refill call.
4. Show that it offers the same human-reviewed repair.

**Say:** "An outcome is not proof it followed the rules. The Copilot reads
the transcripts against the guidelines, and it is just as important that it stays quiet on
the clean ones."

## Demo 6: interview from nothing

**Purpose.** Initial implementation without a document, which is common in practice.

On a new blank agent click **Design an agent from scratch**, then, for the questions it asks:
*"Use your defaults."* (Or describe a car repair shop in one line.)

**Expect:** one message with at most five numbered questions, each with a default it will
assume, then a full proposal, with a summary saved as the agent's guidelines.

**Say:** "It asks only what it cannot infer, and it never invents prices or hours."

## Demo 7: guardrails

**Purpose.** Judgment and trust. Show the failure modes the design avoids.

- **Draft safety.** Edit a step by hand without saving, then try to Apply a proposal. It tells
  you to Save or Cancel first. Nothing is merged silently.
- **Review behavior.** On the deployed agent click **Review behavior**, then **Propose all
  changes**: a model review with verbatim guideline excerpts, turned into one atomic proposal.
- **Evals.** Show the green `make eval-copilot` result: it scores tool calls and cited turns,
  including the clean call that must not be flagged.

## Demo 8: manual edit

**Purpose.** Requirement: a UI to edit the node graph.

Select a step, change its instruction, add a step, connect it, set a required field, fix an
invalid link (watch the validation error), then **Save**. Then **Cancel** a second change.

**Say:** "The Copilot and the manual editor use the same operations and the same Python
validator."

## Demo 9: scoping, in one minute

Open the table in [solution.md](solution.md) and go through it quickly: no auth, no database,
no real ingestion, no background monitor, no autonomous edits. Then name what you would build
next: replaying old calls against a candidate before Apply.

## If something goes wrong

| Problem | Do this |
| --- | --- |
| Copilot is slow or errors | Press retry, or ask again; saved state is unchanged. Mention the stale-proposal guard. |
| Proposal is invalid | Show that Apply is disabled and the errors are shown. This is the guard working. |
| Voice has a bad take | Hang up and retry. The agent is saved, so the next call uses the same revision. |
| Microphone blocked | Test Call shows a recoverable error. Fix the permission and retry. |
| Citation shows *unverified* | Say so: that is the anti-hallucination rule. Ask it to read the call again. |

## Evidence to have ready

- `make verify` and `make e2e` green.
- `make eval-copilot` results (README, Evidence).
- The real call outcomes for demos 1, 2 and 4 (with the tool lines visible), recorded in the README's Evidence section.
