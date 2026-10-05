import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import fixture from '../../evals/fixtures/rename-agent.json';
import trace from '../../evals/traces/rename-agent.json';
import { runEvals } from './run-evals';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'prosper-evals-'));
  await mkdir(join(root, 'evals/fixtures'), { recursive: true });
  await mkdir(join(root, 'evals/traces'), { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const json = (path: string, value: unknown) => writeFile(join(root, path), JSON.stringify(value));
const report = async (mode: string) => JSON.parse(await readFile(join(root, `evals/results/${mode}.json`), 'utf8'));

test('records malformed fixtures and missing traces, then continues to later cases', async () => {
  await writeFile(join(root, 'evals/fixtures/01-broken.json'), '{');
  await json('evals/fixtures/02-missing.json', { ...fixture, id: 'missing-trace' });
  await json('evals/fixtures/03-valid.json', fixture);
  await json('evals/traces/03-valid.json', trace);
  expect(await runEvals('recorded', root)).toBe(false);
  const saved = await report('recorded');
  expect(saved.results.map((item: { failures: string[] }) => item.failures.length > 0)).toEqual([true, true, false]);
  expect(saved.results[1].failures[0]).toContain('02-missing.json');
  expect(saved.results[2].response).toEqual(trace);
});

test('rejects empty suites and replaces stale evidence when the adapter is absent', async () => {
  expect(await runEvals('recorded', root)).toBe(false);
  expect((await report('recorded')).failures).toEqual(['No eval fixtures found']);
  await json('evals/results/live.json', { results: [{ passed: true }] });
  expect(await runEvals('live', root)).toBe(false);
  const saved = await report('live');
  expect(saved.results).toEqual([]);
  expect(saved.failures[0]).toContain('No live eval was run.');
});

test('captures adapter errors and subsequent tool evidence without giving it expected answers', async () => {
  await json('evals/fixtures/01-error.json', { ...fixture, id: 'provider-failure', prompt: 'Fail' });
  await json('evals/fixtures/02-valid.json', fixture);
  const response = { model: { provider: 'test-only', id: 'fake', settings: {} }, trace };
  await writeFile(join(root, 'adapter.mjs'), `export async function run(input) {
    if (Object.keys(input).sort().join(',') !== 'agent,prompt') throw new Error('Leaked scoring criteria');
    if (input.prompt === 'Fail') throw new Error('Provider unavailable');
    return ${JSON.stringify(response)};
  }`);
  expect(await runEvals('live', root, 'adapter.mjs')).toBe(false);
  const saved = await report('live');
  expect(saved.results[0].failures).toEqual(['Provider unavailable']);
  expect(saved.results[1].failures).toEqual([]);
  expect(saved.results[1].response).toEqual(response);
  expect(saved.results[1].fixture.prompt).toBe(fixture.prompt);
});

test('rejects adapter output lacking actual model metadata and preserves it for diagnosis', async () => {
  await json('evals/fixtures/case.json', fixture);
  await writeFile(join(root, 'adapter.mjs'), `export async function run() { return ${JSON.stringify(trace)}; }`);
  expect(await runEvals('live', root, 'adapter.mjs')).toBe(false);
  const saved = await report('live');
  expect(saved.results[0].failures[0]).toContain('model');
  expect(saved.results[0].response).toEqual(trace);
});
