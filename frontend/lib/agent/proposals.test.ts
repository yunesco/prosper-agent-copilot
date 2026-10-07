import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import {
  candidateDiff,
  commitProposal,
  constructProposal,
  exact,
  groundedReviewSchema,
  groundReview,
  referenceExists,
} from './proposals';
import { applyAgentOperations } from './operations';
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
  expect(base.agent.name).toBe('Riverside Clinic Scheduler');
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
test('guidelines in a proposal are diffed and saved with the reviewed candidate', async () => {
  const empty = { ...base, guidelines: '' };
  const proposal = await constructProposal(
    empty,
    { ...patch, guidelines: 'Greet, then book.' },
    async () => {},
  );
  expect(
    candidateDiff(empty.agent, proposal.candidate, { before: '', after: proposal.guidelines })[0],
  ).toMatchObject({
    label: 'guidelines',
    before: '',
    after: 'Greet, then book.',
  });
  const { repository } = repo();
  await repository.saveAgent(base.id, { agent: base.agent, guidelines: '' }, 1, () => {});
  const saved = await commitProposal(
    repository,
    { ...empty, revision: 2 },
    { ...proposal, baseRevision: 2 },
    () => {},
  );
  expect(saved.guidelines).toBe('Greet, then book.');
  expect(saved.revision).toBe(3);
});
test('a guidelines-only proposal is not a no-op, and omitted guidelines keep the saved text', async () => {
  const noOps = { ...patch, operations: [{ type: 'update_agent', changes: { name: base.agent.name } }] };
  await expect(constructProposal(base, noOps, async () => {})).rejects.toThrow('no configuration changes');
  await expect(
    constructProposal(base, { ...noOps, guidelines: 'New text' }, async () => {}),
  ).resolves.toMatchObject({ guidelines: 'New text' });
  const { repository } = repo();
  const kept = await commitProposal(
    repository,
    base,
    await constructProposal(base, patch, async () => {}),
    () => {},
  );
  expect(kept.guidelines).toBe(base.guidelines);
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

test('model review schema is accepted by OpenAI strict structured outputs for quoted guidelines', () => {
  const guidelines =
    'Accept short answers such as "yes" or "Monday". Never invent availability.\n\nUse C:\\notes.';
  const schema = groundedReviewSchema(guidelines);
  const json = z.toJSONSchema(schema, { io: 'input' }) as unknown as {
    properties: { behaviors: { items: { properties: { excerpt: { enum: string[] } } } } };
  };
  const options = json.properties.behaviors.items.properties.excerpt.enum;
  // Strict mode rejects quotes, backslashes and line breaks in enum literals, and duplicate values.
  expect(options.some(option => /["\\\n\r\t]/.test(option))).toBe(false);
  expect(new Set(options).size).toBe(options.length);
  const quoted = options.find(option => option.includes("'yes'"))!;
  const parsed = schema.parse({
    summary: 'Review',
    behaviors: [
      {
        behavior: 'Short answers',
        excerpt: quoted,
        references: [],
        finding: 'Compare',
        status: 'aligned',
        clarification: null,
      },
    ],
  });
  // The grounded excerpt is the exact source text, quotes included.
  expect(guidelines.includes(parsed.behaviors[0].excerpt)).toBe(true);
  expect(parsed.behaviors[0].excerpt).toContain('"yes" or "Monday"');
});

describe('structural gate', () => {
  const stuck = [{ type: 'update_node', node: 'confirm', changes: { end: false } }];
  const trap = [
    {
      type: 'update_edge',
      node: 'offer_times',
      function: 'select_time',
      changes: { target: 'collect_details' },
    },
  ];
  const propose = (agent = base.agent, operations: unknown[] = stuck) =>
    constructProposal({ ...base, agent }, { ...(patch as object), operations }, async () => {});

  test('blocks a proposal that introduces a dead-end step', async () => {
    await expect(propose()).rejects.toThrow(/Step confirm has no transition/);
  });
  test('blocks a proposal that introduces a loop which can never end the call', async () => {
    await expect(propose(base.agent, trap)).rejects.toThrow(/cannot reach any step that ends the call/);
  });
  test('does not run Python validation for a structurally broken candidate', async () => {
    const validate = vi.fn(async () => {});
    await expect(constructProposal(base, { ...patch, operations: stuck }, validate)).rejects.toThrow();
    expect(validate).not.toHaveBeenCalled();
  });
  test('an agent that was already broken can still be edited, so one old defect never blocks every change', async () => {
    const broken = applyAgentOperations(base.agent, stuck as never);
    const proposal = await propose(broken, patch.operations);
    expect(proposal.candidate.name).toBe('New name');
  });
});

describe('hostile proposals', () => {
  const start = base.agent.initial_node;
  test.each([
    ['deleting the start step', [{ type: 'delete_node', node: start }]],
    [
      'pointing a transition at a missing step',
      [
        {
          type: 'update_edge',
          node: start,
          function: base.agent.nodes[0].edges[0].function,
          changes: { target: 'ghost' },
        },
      ],
    ],
  ])('%s is rejected and persists nothing', async (_, operations) => {
    const { repository, write } = repo();
    await expect(
      constructProposal(base, { ...patch, operations } as unknown as typeof patch, async () => {}),
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    expect((await repository.getAgent(base.id)).revision).toBe(1);
  });
});
