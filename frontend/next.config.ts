import type { NextConfig } from 'next';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

// The challenge's backend/.env is the shared server-side configuration.
// Load at Next startup for both the root launcher and standalone frontend runs.
// Existing process variables (including Next's local overrides) take precedence.
const sharedEnv = path.resolve(import.meta.dirname, '../backend/.env');
if (existsSync(sharedEnv)) loadEnvFile(sharedEnv);

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Fixtures live beside frontend; the root package only runs dev processes.
  turbopack: { root: path.resolve(import.meta.dirname, '..') },
  // Repository instructions are maintained explicitly in the root AGENTS.md.
  agentRules: false,
};

export default config;
