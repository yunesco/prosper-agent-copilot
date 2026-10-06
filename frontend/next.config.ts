import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Fixtures live beside frontend; the root package only runs dev processes.
  turbopack: { root: path.resolve(import.meta.dirname, '..') },
  // Repository instructions are maintained explicitly in the root AGENTS.md.
  agentRules: false,
};

export default config;
