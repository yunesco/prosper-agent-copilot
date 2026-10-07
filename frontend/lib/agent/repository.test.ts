import { expect, test, vi } from 'vitest';
import { LocalAgentRepository, commitAgent, savedAgentSchema } from './repository';
import { loadAgentFixture } from '../fixtures';

function setup() {
  let raw: string | null = null;
  const storage = {
    getItem: vi.fn(() => raw),
    setItem: vi.fn((_key: string, value: string) => {
      raw = value;
    }),
  };
  const validate = vi.fn(async () => {});
  const repository = new LocalAgentRepository(
    () => storage,
    validate,
    () => 'generated',
  );
  return { repository, storage, validate, raw: () => raw };
}

test('initializes two independent validated records once and reloads selection', async () => {
  const { repository, storage, validate } = setup();
  const doc = await repository.initialize();
  expect(doc.selectedId).toBe('generated');
  expect(doc.agents.map(a => [a.id, a.revision])).toEqual([
    ['generated', 1],
    ['riverside-family-clinic', 1],
  ]);
  expect(doc.agents[0].agent.nodes[0]).toMatchObject({ name: 'start', end: true });
  expect(doc.agents[1].agent).toEqual(loadAgentFixture('riverside-family-clinic'));
  expect(validate).toHaveBeenCalledTimes(2);
  repository.selectAgent('riverside-family-clinic');
  expect((await new LocalAgentRepository(() => storage, validate).initialize()).selectedId).toBe(
    'riverside-family-clinic',
  );
  expect(validate).toHaveBeenCalledTimes(2);
  expect((await repository.getAgent('riverside-family-clinic')).revision).toBe(1);
});

test.each(['{', '{"version":2}', JSON.stringify({ version: 1, selectedId: 'missing', agents: [] })])(
  'preserves malformed or unsupported storage: %s',
  async raw => {
    const storage = { getItem: () => raw, setItem: vi.fn() };
    await expect(new LocalAgentRepository(() => storage).initialize()).rejects.toThrow('malformed');
    expect(storage.setItem).not.toHaveBeenCalled();
  },
);

test('denied storage, validation failure and failed writes cannot initialize ephemeral state', async () => {
  await expect(
    new LocalAgentRepository(() => {
      throw new Error('denied');
    }).initialize(),
  ).rejects.toThrow('denied');
  const { repository, validate, storage, raw } = setup();
  validate.mockRejectedValueOnce(new Error('invalid'));
  await expect(repository.initialize()).rejects.toThrow('invalid');
  expect(raw()).toBeNull();
  storage.setItem.mockImplementationOnce(() => {
    throw new Error('quota');
  });
  await expect(repository.initialize()).rejects.toThrow('quota');
  expect(raw()).toBeNull();
});

test('no-ops preserve revisions, guidelines increment once, native payloads survive reload', async () => {
  const { repository, storage } = setup();
  const base = (await repository.initialize()).agents[1];
  expect(await repository.saveAgent(base.id, base, 1)).toEqual(base);
  const next = await repository.saveAgent(base.id, { ...base, guidelines: 'Plain text <not markup>' }, 1);
  expect(next.revision).toBe(2);
  const agent = structuredClone(next.agent);
  agent.nodes[0].pre_actions.push({ type: 'tts', text: 'Hello', native: { values: [1, null, true] } });
  const final = await repository.saveAgent(base.id, { agent, guidelines: next.guidelines }, 2);
  expect(final.revision).toBe(3);
  expect(await new LocalAgentRepository(() => storage).getAgent(base.id)).toEqual(final);
  expect(savedAgentSchema.safeParse({ ...final, revision: 0 }).success).toBe(false);
});

test('failed saves leave exact persisted bytes untouched and allow retry', async () => {
  const { repository, storage, validate, raw } = setup();
  const base = (await repository.initialize()).agents[0],
    before = raw();
  validate.mockRejectedValueOnce(new Error('invalid'));
  await expect(repository.saveAgent(base.id, { ...base, guidelines: 'changed' }, 1)).rejects.toThrow(
    'invalid',
  );
  expect(raw()).toBe(before);
  storage.setItem.mockImplementationOnce(() => {
    throw new Error('quota');
  });
  await expect(repository.saveAgent(base.id, { ...base, guidelines: 'changed' }, 1)).rejects.toThrow('quota');
  expect(raw()).toBe(before);
  expect((await repository.saveAgent(base.id, { ...base, guidelines: 'changed' }, 1)).revision).toBe(2);
});

test('overlapping validation resolves out of order without overwriting a newer revision', async () => {
  const { repository, validate } = setup();
  const base = (await repository.initialize()).agents[0];
  let release = () => {};
  validate.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        release = resolve;
      }),
  );
  const pending = repository.saveAgent(base.id, { ...base, guidelines: 'old' }, 1);
  await repository.saveAgent(base.id, { ...base, guidelines: 'new' }, 1);
  const rejected = expect(pending).rejects.toThrow('changed');
  release();
  await rejected;
  expect((await repository.getAgent(base.id)).guidelines).toBe('new');
});

test('context generations reject switch-away/switch-back and canceled candidates after validation', async () => {
  const { repository, validate } = setup();
  const base = (await repository.initialize()).agents[0];
  let generation = 1,
    release = () => {};
  validate.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        release = resolve;
      }),
  );
  const captured = generation;
  const pending = commitAgent(
    repository,
    base,
    [{ type: 'update_agent', changes: { name: 'late' } }],
    'late',
    () => {
      if (generation !== captured) throw new Error('stale context');
    },
  );
  repository.selectAgent('riverside-family-clinic');
  generation++;
  repository.selectAgent(base.id);
  generation++;
  const rejected = expect(pending).rejects.toThrow('stale context');
  release();
  await rejected;
  expect(await repository.getAgent(base.id)).toEqual(base);
});

test('create validates, assigns identity and revision, and does not change selection', async () => {
  const { repository, storage, validate } = setup();
  const initial = await repository.initialize();
  const creator = new LocalAgentRepository(
    () => storage,
    validate,
    () => 'another',
  );
  const record = await creator.createAgent(initial.agents[0]);
  expect(record.id).toBe('another');
  expect(record.revision).toBe(1);
  expect(JSON.parse(storage.getItem()!).selectedId).toBe(initial.selectedId);
});

test('deleteAgent removes an agent, selects its neighbour, and keeps the last one', async () => {
  let n = 0;
  const store = new Map<string, string>();
  const repo = new LocalAgentRepository(
    () => ({ getItem: key => store.get(key) ?? null, setItem: (key, value) => void store.set(key, value) }),
    async () => {},
    () => `id-${++n}`,
  );
  const initial = await repo.initialize();
  const [first, second] = initial.agents;
  expect(repo.deleteAgent(first.id)).toMatchObject({ selectedId: second.id, agents: [{ id: second.id }] });
  expect(() => repo.deleteAgent(second.id)).toThrow('last agent');
  expect(() => repo.deleteAgent('missing')).toThrow('not found');
  expect((await repo.getAgent(second.id)).id).toBe(second.id);
});

test('unicode, emoji, markup and very long text round-trip verbatim through storage', async () => {
  const { repository } = setup();
  const doc = await repository.initialize();
  const record = doc.agents[0];
  const name = '<img src=x onerror=alert(1)> **Clínica** 🏥 Ωmega';
  const guidelines = `# ${'long line '.repeat(20_000)}\n<script>1</script> 日本語 🧑‍⚕️`;
  const saved = await commitAgent(
    repository,
    record,
    [{ type: 'update_agent', changes: { name } }],
    guidelines,
    () => {},
  );
  const reloaded = await repository.getAgent(record.id);
  expect(reloaded).toEqual(saved);
  expect(reloaded.agent.name).toBe(name);
  expect(reloaded.guidelines).toBe(guidelines);
});

test('a second tab holding an older revision cannot overwrite the newer save', async () => {
  const { repository, storage } = setup();
  const doc = await repository.initialize();
  const original = doc.agents[0];
  const otherTab = new LocalAgentRepository(
    () => storage,
    async () => {},
  );
  await commitAgent(
    repository,
    original,
    [{ type: 'update_agent', changes: { name: 'Tab one' } }],
    '',
    () => {},
  );
  await expect(
    commitAgent(otherTab, original, [{ type: 'update_agent', changes: { name: 'Tab two' } }], '', () => {}),
  ).rejects.toThrow(/changed/);
  expect((await repository.getAgent(original.id)).agent.name).toBe('Tab one');
});
