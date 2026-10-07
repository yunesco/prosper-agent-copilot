import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { toolNames } from './tools';

it('lists exactly the tools the Python runtime registers', () => {
  const backend = fileURLToPath(new URL('../../../backend/', import.meta.url));
  const out = execFileSync(
    'uv',
    [
      'run',
      '--quiet',
      'python',
      '-c',
      'import json;from agent_builder.tools import TOOLS;print(json.dumps(sorted(TOOLS)))',
    ],
    { cwd: backend, encoding: 'utf8' },
  );
  expect([...toolNames].sort()).toEqual(JSON.parse(out.trim().split('\n').at(-1)!));
});
