import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evalFixtureSchema, evaluate, liveEvalSchema, loadEvalAgent, type EvalAdapter } from './eval-harness';
import { loadDemoContext } from '../lib/fixtures';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
type Mode = 'recorded' | 'live';

// Root is injectable so runner failure paths use temporary fixtures/results in tests.
export async function runEvals(mode: Mode, root = repoRoot, adapterPath?: string) {
  const output = resolve(root, 'evals/results', `${mode}.json`);
  const report = {
    mode,
    started_at: new Date().toISOString(),
    adapter: adapterPath ?? null,
    failures: [] as string[],
    results: [] as { file: string; id?: string; fixture?: unknown; response?: unknown; failures: string[] }[],
  };
  await mkdir(resolve(root, 'evals/results'), { recursive: true });
  const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await save(); // Never leave a previous passing report behind after a failed run.
  try {
    let adapter: EvalAdapter | undefined;
    if (mode === 'live') {
      if (!adapterPath)
        throw new Error('Set COPILOT_EVAL_ADAPTER to a module exporting run(input). No live eval was run.');
      const adapterModule = await import(pathToFileURL(resolve(root, adapterPath)).href);
      if (typeof adapterModule.run !== 'function')
        throw new Error('Eval adapter must export run(input). No live eval was run.');
      adapter = adapterModule.run;
    }
    const directory = resolve(root, 'evals/fixtures');
    const files = (await readdir(directory)).filter(file => file.endsWith('.json')).sort();
    if (!files.length) throw new Error('No eval fixtures found');
    const ids = new Set<string>();
    for (const file of files) {
      const result: (typeof report.results)[number] = { file, failures: [] };
      try {
        result.fixture = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
        const fixture = evalFixtureSchema.parse(result.fixture);
        if (mode === 'recorded' && fixture.live_only) continue;
        result.id = fixture.id;
        if (ids.has(fixture.id)) throw new Error(`Duplicate fixture id: ${fixture.id}`);
        ids.add(fixture.id);
        result.response = adapter
          ? await adapter({
              prompt: fixture.prompt_file
                ? `${fixture.prompt}\n\n${await readFile(resolve(root, fixture.prompt_file), 'utf8')}`
                : fixture.prompt,
              agentId: fixture.agent_id,
              agent: loadEvalAgent(fixture.agent_id),
              guidelines:
                loadDemoContext().guidelines.find(item => item.agent_id === fixture.agent_id)?.text ?? '',
              ...(fixture.intent ? { intent: fixture.intent } : {}),
            })
          : JSON.parse(await readFile(resolve(root, 'evals/traces', file), 'utf8'));
        const trace = adapter ? liveEvalSchema.parse(result.response).trace : result.response;
        result.failures = evaluate(fixture, trace);
      } catch (error) {
        result.failures.push(error instanceof Error ? error.message : String(error));
      }
      report.results.push(result);
      console.log(`${result.failures.length ? 'FAIL' : 'PASS'} ${file} (${mode})`);
      for (const failure of result.failures) console.error(`  ${failure}`);
      await save();
    }
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    report.failures.push(failure);
    console.error(failure);
  }
  await save();
  console.log(`Eval evidence: ${output}`);
  if (mode === 'recorded')
    console.log('Synthetic traces verify the harness only; this is not a Copilot quality score.');
  return report.failures.length === 0 && report.results.every(result => result.failures.length === 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  if (mode !== '--recorded' && mode !== '--live') throw new Error('Use --recorded or --live');
  if (
    !(await runEvals(
      mode === '--live' ? 'live' : 'recorded',
      repoRoot,
      process.env.COPILOT_EVAL_ADAPTER || 'frontend/scripts/copilot-adapter.ts',
    ))
  )
    process.exitCode = 1;
}
