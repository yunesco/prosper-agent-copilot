// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PaneDivider } from './PaneDivider';

beforeEach(() => {
  class Pointer extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  vi.stubGlobal('PointerEvent', Pointer);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  const onResize = vi.fn(),
    onCommit = vi.fn();
  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({ left: 0, width: 1008 }) as DOMRect;
  render(
    <PaneDivider
      container={{ current: container }}
      value={60}
      max={75}
      controls="pane"
      onResize={onResize}
      onCommit={onCommit}
    />,
  );
  const divider = screen.getByRole('separator');
  const captured = new Set<number>();
  divider.setPointerCapture = vi.fn(id => {
    captured.add(id);
  });
  divider.hasPointerCapture = id => captured.has(id);
  divider.releasePointerCapture = vi.fn(id => {
    captured.delete(id);
  });
  return { divider, onResize, onCommit };
}

test('only the initiating pointer can resize or complete a drag', () => {
  const { divider, onResize, onCommit } = setup();
  fireEvent.pointerDown(divider, { pointerId: 1, button: 0 });
  fireEvent.pointerMove(divider, { pointerId: 1, clientX: 654 });
  expect(onResize).toHaveBeenLastCalledWith(65);
  fireEvent.pointerDown(divider, { pointerId: 2, button: 0 });
  fireEvent.pointerMove(divider, { pointerId: 2, clientX: 704 });
  fireEvent.pointerUp(divider, { pointerId: 2 });
  fireEvent.pointerCancel(divider, { pointerId: 2 });
  fireEvent.lostPointerCapture(divider, { pointerId: 2 });
  expect(onResize).toHaveBeenCalledTimes(1);
  expect(onCommit).not.toHaveBeenCalled();
  expect(divider.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  fireEvent.pointerUp(divider, { pointerId: 1 });
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(65);
  expect(divider.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
});

for (const ending of ['cancel', 'lost', 'escape'] as const)
  test(`${ending} restores initial width and relinquishes capture`, () => {
    const { divider, onResize, onCommit } = setup();
    fireEvent.pointerDown(divider, { pointerId: 1, button: 0 });
    fireEvent.pointerMove(divider, { pointerId: 1, clientX: 704 });
    if (ending === 'cancel') fireEvent.pointerCancel(divider, { pointerId: 1 });
    else if (ending === 'lost') {
      divider.releasePointerCapture(1);
      fireEvent.lostPointerCapture(divider, { pointerId: 1 });
    } else fireEvent.keyDown(divider, { key: 'Escape' });
    expect(onResize).toHaveBeenLastCalledWith(60);
    expect(divider.hasPointerCapture(1)).toBe(false);
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
  });

test('keyboard increments, bounds, and double-click reset remain available', () => {
  const { divider, onCommit } = setup();
  fireEvent.keyDown(divider, { key: 'ArrowLeft' });
  fireEvent.keyDown(divider, { key: 'ArrowRight', shiftKey: true });
  fireEvent.keyDown(divider, { key: 'Home' });
  fireEvent.keyDown(divider, { key: 'End' });
  fireEvent.doubleClick(divider);
  expect(onCommit.mock.calls).toEqual([[58], [70], [40], [75], [70]]);
});
