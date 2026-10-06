# Pending work

Scope: [solution.md](solution.md). Current behavior and commands: [README.md](README.md).
This is the only roadmap; completed work is removed, not logged.

## Live voice evidence

**Needs:** a microphone, `backend/.env` keys, `npm run dev`.

- [ ] Real Test Call of an agent Copilot generated from `fixtures/demo-sop.md`: new-patient
  happy path (name, DOB, insurance, only Monday/Wednesday offered, confirmation).
- [ ] One branching case on the same agent: existing patient skips insurance and may book Friday.
- [ ] Real Test Call of the repaired deployed scheduler: a new patient is no longer offered Friday.

**Acceptance:** each call behaves as stated. Mocked transcripts and recorded traces are not
live evidence; record outcomes in the README's Evidence section.

## Conversation-quality tests

- [ ] Deterministic tests that generated and repaired agents ask for missing information,
  accept valid short answers, honor corrections, reuse information given early, and do not
  advance before required fields exist. Fix confirmed causes at the owning boundary
  (operations, prompt contract, or runtime), keeping the voice stack unchanged.

## Optional

- [ ] Pre-Apply replay: run a historical call's caller turns against the candidate and show the
  result as a clearly labelled simulated check in the proposal's "Conversation checks" slot.
