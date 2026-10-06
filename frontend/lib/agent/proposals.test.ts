import { describe, expect, test, vi } from 'vitest';
import {
  candidateDiff,
  commitProposal,
  constructProposal,
  exact,
  groundedReviewSchema,
  groundReview,
  referenceExists,
} from './proposals';
import { loadAgentFixture } from '../fixtures';
import { LocalAgentRepository } from './repository';
const base = {
  id: 'clinic-scheduler',
  revision: 1,
  guidelines: 'Existing patients skip insurance.',
  agent: loadAgentFixture('clinic-scheduler'),
};
const patch = {
  agentId: base.id,
  baseRevision: 1,
  outcome: 'Rename',
  explanation: 'Requested',
  behavior: 'Display name',
  operations: [{ type: 'update_agent', changes: { name: 'New name' } }],
};
function repo(validate = vi.fn(async () => {}), fail = false) {
  let raw = JSON.stringify({ version: 1, selectedId: base.id, agents: [base] });
  const write = vi.fn((_: string, value: string) => {
    if (fail) throw new Error('Storage full');
    raw = value;
  });
  return {
    repository: new LocalAgentRepository(() => ({ getItem: () => raw, setItem: write }), validate),
    write,
  };
}
test('proposal preserves native payloads, has exact derived diff, and generation never writes', async () => {
  const validate = vi.fn(async () => {});
  const proposal = await constructProposal(base, patch, validate);
  expect(validate).toHaveBeenCalledWith(proposal.candidate);
  expect(proposal.candidate.nodes).toEqual(base.agent.nodes);
  expect(candidateDiff(base.agent, proposal.candidate)).toEqual([
    { label: 'name', before: base.agent.name, after: 'New name', reference: undefined },
  ]);
  expect(base.agent.name).toBe('Demo Clinic Scheduler');
});
test('exact reviewed candidate saves once and duplicate or concurrent commit fails', async () => {
  const proposal = await constructProposal(base, patch, async () => {});
  const { repository, write } = repo();
  const results = await Promise.allSettled([
    commitProposal(repository, base, proposal, () => {}),
    commitProposal(repository, base, proposal, () => {}),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(write).toHaveBeenCalledTimes(1);
  expect(exact((await repository.getAgent(base.id)).agent)).toBe(exact(proposal.candidate));
  expect((await repository.getAgent(base.id)).revision).toBe(2);
});
for (const reason of ['dirty draft', 'agent switched', 'guidelines changed'])
  test(`rechecks ${reason} after validation; no save`, async () => {
    const proposal = await constructProposal(base, patch, async () => {});
    let valid = true;
    const { repository, write } = repo(
      vi.fn(async () => {
        valid = false;
      }),
    );
    await expect(
      commitProposal(repository, base, proposal, () => {
        if (!valid) throw new Error(reason);
      }),
    ).rejects.toThrow(reason);
    expect(write).not.toHaveBeenCalled();
  });
test('rejects tampering, stale guidelines and storage failure without changing saved state', async () => {
  const proposal = await constructProposal(base, patch, async () => {});
  const { repository, write } = repo();
  await expect(
    commitProposal(repository, base, { ...proposal, candidate: base.agent }, () => {}),
  ).rejects.toThrow('does not match');
  await repository.saveAgent(base.id, { agent: base.agent, guidelines: 'Changed guidelines' }, 1);
  await expect(commitProposal(repository, base, proposal, () => {})).rejects.toThrow('changed');
  expect(write).toHaveBeenCalledTimes(1);
  const failed = repo(undefined, true);
  await expect(commitProposal(failed.repository, base, proposal, () => {})).rejects.toThrow('Storage full');
  expect(await failed.repository.getAgent(base.id)).toEqual(base);
});
describe('fail closed', () => {
  test('malformed, unknown node, stale ID/revision, Python rejection/unavailability', async () => {
    for (const input of [
      {},
      { ...patch, agentId: 'other' },
      { ...patch, baseRevision: 2 },
      { ...patch, operations: [{ type: 'delete_node', node: 'missing' }] },
    ])
      await expect(constructProposal(base, input, async () => {})).rejects.toThrow();
    for (const error of ['unreachable step', 'Validation service unavailable'])
      await expect(
        constructProposal(base, patch, async () => {
          throw new Error(error);
        }),
      ).rejects.toThrow(error);
  });
  test('review requires exact guideline excerpts and available structural references', () => {
    const item = {
      behavior: 'Insurance bypass',
      excerpt: base.guidelines,
      references: [{ kind: 'node', node: 'collect_details' }],
      finding: 'Clarify instructions',
      status: 'potential_mismatch',
      clarification: null,
    };
    expect(groundReview(base, { summary: 'Review', behaviors: [item] }).revision).toBe(1);
    expect(() =>
      groundReview(base, { summary: 'Review', behaviors: [{ ...item, excerpt: 'Invented' }] }),
    ).toThrow('excerpt');
    expect(() =>
      groundReview(base, {
        summary: 'Review',
        behaviors: [
          { ...item, references: [{ kind: 'transition', node: 'collect_details', function: 'missing' }] },
        ],
      }),
    ).toThrow('unavailable');
    expect(() => groundReview({ ...base, guidelines: '' }, { summary: '', behaviors: [] })).toThrow(
      'save guidelines',
    );
    expect(referenceExists(base.agent, { kind: 'node', node: 'historical-deleted' })).toBe(false);
  });
});

test('model review schema only permits verbatim source passages', () => {
  const schema = groundedReviewSchema(base.guidelines);
  const finding = {
    behavior: 'Insurance',
    excerpt: base.guidelines,
    references: [],
    finding: 'Compare',
    status: 'aligned',
    clarification: null,
  };
  expect(schema.safeParse({ summary: 'Review', behaviors: [finding] }).success).toBe(true);
  expect(
    schema.safeParse({
      summary: 'Review',
      behaviors: [{ ...finding, excerpt: 'Existing patients do not need insurance.' }],
    }).success,
  ).toBe(false);
});
