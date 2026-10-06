// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ReactFlow } from '@xyflow/react';
import { StepNode } from './StepNode';
import { ConditionEdge } from './ConditionEdge';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('React Flow warning 002 tracks renderer identities, not newly allocated type maps', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const onError = vi.fn();
  const { rerender } = render(
    <ReactFlow
      nodes={[]}
      edges={[]}
      nodeTypes={{ step: StepNode }}
      edgeTypes={{ condition: ConditionEdge }}
      onError={onError}
    />,
  );
  rerender(
    <ReactFlow
      nodes={[]}
      edges={[]}
      nodeTypes={{ step: StepNode }}
      edgeTypes={{ condition: ConditionEdge }}
      onError={onError}
    />,
  );
  expect(onError.mock.calls.filter(([code]) => code === '002')).toHaveLength(0);
  // Reproduces the two warnings from recreating both functions in a refreshed module.
  rerender(
    <ReactFlow
      nodes={[]}
      edges={[]}
      nodeTypes={{ step: () => null }}
      edgeTypes={{ condition: () => null }}
      onError={onError}
    />,
  );
  expect(onError.mock.calls.filter(([code]) => code === '002')).toHaveLength(2);
});
