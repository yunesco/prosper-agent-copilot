// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { CollectedFieldsEditor } from './CollectedFieldsEditor';
import { editCollectedField, type FieldDraft } from '@/lib/agent/collected-fields';
import type { AgentEdge } from '@/lib/agent/schema';

afterEach(cleanup);
function Harness() {
  const [edge, setEdge] = useState<AgentEdge>({
    target: 'end',
    function: 'collect',
    description: '',
    properties: { name: { type: 'string', description: 'Caller name' } },
    required: ['name'],
  });
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  return (
    <CollectedFieldsEditor
      edge={edge}
      disabled={false}
      draft={draft ?? undefined}
      onDraft={setDraft}
      onChange={fields => setEdge({ ...edge, ...fields })}
      onDone={() => {
        if (!draft) return;
        try {
          setEdge({ ...edge, ...editCollectedField(edge, draft) });
          setDraft(null);
        } catch (error) {
          setDraft({ ...draft, error: (error as Error).message });
        }
      }}
    />
  );
}

test('new field focuses its first input and Cancel returns to Add information', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Add information' }));
  expect(screen.getByLabelText('Information name')).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel field' }));
  expect(screen.getByRole('button', { name: 'Add information' })).toHaveFocus();
});

test('editing focuses Field key and Done returns to the renamed row', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Name Text Required' }));
  expect(screen.getByLabelText('Field key')).toHaveFocus();
  fireEvent.change(screen.getByLabelText('Field key'), { target: { value: 'full_name' } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('button', { name: 'Full name Text Required' })).toHaveFocus();
});

test('Done on a new field returns to Add information', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Add information' }));
  fireEvent.change(screen.getByLabelText('Information name'), { target: { value: 'Insurance' } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('button', { name: 'Add information' })).toHaveFocus();
});

test('invalid Done keeps focus inside the editor and Cancel restores the original row', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Name Text Required' }));
  fireEvent.change(screen.getByLabelText('Field key'), { target: { value: '' } });
  screen.getByRole('button', { name: 'Done' }).focus();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a field key.');
  expect(screen.getByLabelText('Field key')).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel field' }));
  expect(screen.getByRole('button', { name: 'Name Text Required' })).toHaveFocus();
});
