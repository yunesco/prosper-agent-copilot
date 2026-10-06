// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { NodeProps } from '@xyflow/react';
import type { StepNode as StepNodeType } from '@/lib/agent/graph';
import { StepNode } from './StepNode';
const update = vi.hoisted(() => vi.fn());
vi.mock('@xyflow/react', () => ({ Position: { Top: 'top', Bottom: 'bottom' }, Handle: () => null, NodeToolbar: () => null, useUpdateNodeInternals: () => update }));
afterEach(() => { cleanup(); update.mockClear(); });
test('initial measurement is left to React Flow; changed incoming handles are remeasured', () => {
  const props: NodeProps<StepNodeType> = { id: 'end', data: { label: 'End', initial: false, terminal: true, endsConversation: true, description: '', outgoing: [], incoming: [] }, type: 'step', selected: false, dragging: false, zIndex: 0, isConnectable: true, positionAbsoluteX: 0, positionAbsoluteY: 0, selectable: true, deletable: true, draggable: true };
  const { rerender } = render(<StepNode {...props} />);
  expect(update).not.toHaveBeenCalled();
  rerender(<StepNode {...props} data={{ ...props.data, incoming: [{ id: 'one', source: 'start' }] }} />);
  expect(update).toHaveBeenCalledExactlyOnceWith('end');
  rerender(<StepNode {...props} data={{ ...props.data, incoming: [{ id: 'one', source: 'start' }] }} />);
  expect(update).toHaveBeenCalledTimes(1);
});
