// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { ConnectionMode, XYHandle } from '@xyflow/system';
import { agentGraph } from './graph';
import { loadAgentFixture } from '../fixtures';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

test('generated handles work with the installed React Flow selector and connection validation', () => {
  const agent = loadAgentFixture('original-scheduler');
  const graph = agentGraph(agent);
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
  for (const edge of graph.edges) {
    for (const type of ['source', 'target'] as const) {
      const id = type === 'source' ? edge.sourceHandle! : edge.targetHandle!;
      const nodeId = type === 'source' ? edge.source : edge.target;
      const element = document.createElement('div');
      element.className = `react-flow__handle ${type} connectable connectableend`;
      element.setAttribute('data-id', `1-${nodeId}-${id}-${type}`);
      element.setAttribute('data-nodeid', nodeId);
      element.setAttribute('data-handleid', id);
      document.body.append(element);
      // Exercise XYHandle.isValid itself: its querySelector interpolates IDs
      // without escaping quotes. Raw JSON tuples threw before reaching validation.
      const result = XYHandle.isValid(new MouseEvent('mousemove'), {
        handle: { id, nodeId, type },
        connectionMode: ConnectionMode.Strict,
        fromNodeId: 'other',
        fromHandleId: 'new',
        fromType: type === 'source' ? 'target' : 'source',
        doc: document,
        lib: 'react',
        flowId: '1',
        nodeLookup: new Map(),
      });
      expect(result.handleDomNode).toBe(element);
      expect(result.isValid).toBe(true);
    }
  }
});
