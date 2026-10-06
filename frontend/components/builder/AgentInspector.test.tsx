// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { applyAgentOperations } from '@/lib/agent/operations';
import { AgentInspector as Inspector } from './AgentInspector';
import { useNodeEdits } from './use-node-edits';
import type { ComponentProps } from 'react';

function AgentInspector(props: Omit<ComponentProps<typeof Inspector>, 'editor'>) {
  const editor = useNodeEdits(props.agent, props.selectedNodeId, props.onSave);
  return <Inspector {...props} editor={editor} />;
}

afterEach(cleanup);

test('instructions edit in place while important settings stay exposed', () => {
  const agent = loadAgentFixture('original-scheduler');
  render(
    <AgentInspector agent={agent} selectedNodeId="collect_details" onSelect={vi.fn()} onSave={vi.fn()} />,
  );
  expect(screen.getByRole('textbox', { name: 'Message 1 instructions' })).toHaveValue(
    String(agent.nodes[1].task_messages[0].content),
  );
  expect(screen.queryByRole('button', { name: 'Edit instructions' })).not.toBeInTheDocument();
  expect(screen.queryByText('Advanced details')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Role instructions')).toHaveValue(agent.persona);
  expect(screen.queryByText(agent.model)).not.toBeInTheDocument();
  expect(screen.queryByText(agent.voice_id)).not.toBeInTheDocument();
  expect(screen.queryByText('Step behavior')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Role instructions').closest('details')).not.toHaveAttribute('open');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('text edits preserve structured messages, native metadata, actions and fields', async () => {
  const agent = loadAgentFixture('original-scheduler');
  const node = agent.nodes[1];
  node.task_messages[0].metadata = { nested: [true, null] };
  node.task_messages.push({
    role: 'assistant',
    content: [{ type: 'text', text: 'Native message' }],
    tool_calls: [],
  });
  const before = structuredClone(agent);
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<AgentInspector agent={agent} selectedNodeId={node.name} onSelect={vi.fn()} onSave={onSave} />);
  expect(screen.getAllByText(/Native message/, { selector: 'pre' })[0]).toBeVisible();
  fireEvent.change(screen.getByLabelText('Message 1 instructions'), { target: { value: 'New goal' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  const candidate = applyAgentOperations(agent, onSave.mock.calls[0][0]);
  expect(candidate.nodes[1]).toEqual({
    ...node,
    task_messages: [{ ...node.task_messages[0], content: 'New goal' }, node.task_messages[1]],
  });
  expect(agent).toEqual(before);
});

test('drafts survive selection and tab changes; Escape cancels without leaving the step', () => {
  const agent = loadAgentFixture('original-scheduler');
  const onSelect = vi.fn();
  const onSave = vi.fn();
  const { rerender } = render(
    <AgentInspector agent={agent} selectedNodeId="collect_details" onSelect={onSelect} onSave={onSave} />,
  );
  fireEvent.change(screen.getByLabelText('Message 1 instructions'), { target: { value: 'Draft' } });
  rerender(<AgentInspector agent={agent} selectedNodeId="confirm" onSelect={onSelect} onSave={onSave} />);
  expect(screen.getByLabelText('Message 1 instructions')).not.toHaveValue('Draft');
  rerender(
    <AgentInspector agent={agent} selectedNodeId="collect_details" onSelect={onSelect} onSave={onSave} />,
  );
  expect(screen.getByLabelText('Message 1 instructions')).toHaveValue('Draft');
  fireEvent.click(screen.getByRole('button', { name: 'Connections' }));
  fireEvent.click(screen.getByRole('button', { name: 'General' }));
  fireEvent.keyDown(screen.getByLabelText('Message 1 instructions'), { key: 'Escape' });
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Message 1 instructions')).toHaveValue(
    String(agent.nodes[1].task_messages[0].content),
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('failed validation keeps the draft, announces the error, and cancel restores committed data', async () => {
  const agent = loadAgentFixture('original-scheduler');
  const onSave = vi.fn().mockRejectedValue(new Error('Validation unavailable'));
  render(<AgentInspector agent={agent} selectedNodeId="greeting" onSelect={vi.fn()} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText('Message 1 instructions'), { target: { value: 'Draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Validation unavailable');
  expect(screen.getByLabelText('Message 1 instructions')).toHaveValue('Draft');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByLabelText('Message 1 instructions')).toHaveValue(
    String(agent.nodes[0].task_messages[0].content),
  );
});

test('transition inspector exposes routing, tool name and collected fields together', async () => {
  const agent = loadAgentFixture('original-scheduler');
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onSelect = vi.fn();
  render(
    <AgentInspector
      agent={agent}
      selectedNodeId="collect_details"
      selectedTransitionFunction="record_details"
      onSelect={onSelect}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByText('Function details'));
  expect(screen.getByLabelText('Function name')).toHaveValue('record_details');
  expect(screen.getByRole('region', { name: 'Collect Full name' })).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Target node' })).toHaveTextContent('Offer times');
  fireEvent.click(screen.getByRole('combobox', { name: 'Target node' }));
  fireEvent.pointerDown(await screen.findByRole('option', { name: 'Confirm' }));
  fireEvent.click(screen.getByRole('option', { name: 'Confirm' }));
  fireEvent.change(screen.getByLabelText('Transition condition'), { target: { value: 'Ready to confirm' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(applyAgentOperations(agent, onSave.mock.calls[0][0]).nodes[1].edges[0]).toEqual({
    ...agent.nodes[1].edges[0],
    description: 'Ready to confirm',
    target: 'confirm',
  });
  expect(agent.nodes[1].edges[0].target).toBe('offer_times');
});

test('collect information with readable fields, preserving native schemas and atomic cancellation', async () => {
  const agent = loadAgentFixture('original-scheduler');
  agent.nodes[1].edges[0].properties.full_name = {
    type: 'string',
    description: 'Name',
    native: { keep: [true] },
  };
  agent.nodes[1].edges[0].properties.custom = { type: 'object', properties: { nested: { type: 'string' } } };
  const before = structuredClone(agent);
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <AgentInspector
      agent={agent}
      selectedNodeId="collect_details"
      selectedTransitionFunction="record_details"
      onSelect={vi.fn()}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add information' }));
  fireEvent.change(screen.getByLabelText('Information name'), { target: { value: 'Insurance provider' } });
  expect(screen.getByRole('checkbox', { name: 'Required' })).toBeChecked();
  fireEvent.change(screen.getByLabelText('Field description'), {
    target: { value: 'Ask who provides the caller’s insurance.' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Required' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  fireEvent.click(screen.getByRole('button', { name: /^Full name/ }));
  fireEvent.change(screen.getByLabelText('Field description'), {
    target: { value: 'Ask for their full name.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  const edge = applyAgentOperations(agent, onSave.mock.calls[0][0]).nodes[1].edges[0];
  expect(edge.properties.insurance_provider).toEqual({
    type: 'string',
    description: 'Ask who provides the caller’s insurance.',
  });
  expect(edge.required).not.toContain('insurance_provider');
  expect(edge.properties.full_name).toEqual({
    type: 'string',
    description: 'Ask for their full name.',
    native: { keep: [true] },
  });
  expect(edge.properties.custom).toEqual(before.nodes[1].edges[0].properties.custom);
  expect(agent).toEqual(before);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Full name' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('region', { name: 'Collect Full name' })).toBeVisible();
});

test('empty goals accept continuous typing without losing focus', () => {
  const agent = loadAgentFixture('original-scheduler');
  agent.nodes[3].task_messages = [];
  render(<AgentInspector agent={agent} selectedNodeId="confirm" onSelect={vi.fn()} onSave={vi.fn()} />);
  const input = screen.getByLabelText('Message 1 instructions');
  input.focus();
  fireEvent.change(input, { target: { value: 'H' } });
  expect(screen.getByLabelText('Message 1 instructions')).toBe(input);
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'Hello' } });
  expect(input).toHaveValue('Hello');
  expect(screen.getByRole('checkbox', { name: 'End conversation after this step' })).toBeChecked();
  expect(screen.queryByText('Step behavior')).not.toBeInTheDocument();
});

test('explicit completion actions show the real behavior without an advanced disclosure', () => {
  const agent = loadAgentFixture('original-scheduler');
  agent.nodes[3].post_actions = [{ type: 'tts_say', text: 'Synthetic action' }];
  render(<AgentInspector agent={agent} selectedNodeId="confirm" onSelect={vi.fn()} />);
  expect(screen.getByText('Synthetic action')).toBeVisible();
  expect(screen.getByText('These actions replace the default end-conversation action.')).toBeVisible();
  expect(screen.queryByText('End conversation')).not.toBeInTheDocument();
});

test('pending validation disables edits and duplicate submission', async () => {
  const agent = loadAgentFixture('original-scheduler');
  let finish!: () => void;
  const onSave = vi.fn(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      }),
  );
  render(<AgentInspector agent={agent} selectedNodeId="greeting" onSelect={vi.fn()} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText('Message 1 instructions'), { target: { value: 'Draft' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Node settings' }));
  expect(screen.getByLabelText('Message 1 instructions')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  fireEvent.submit(screen.getByRole('form', { name: 'Node settings' }));
  expect(onSave).toHaveBeenCalledOnce();
  finish();
  await waitFor(() => expect(screen.getByLabelText('Message 1 instructions')).toBeEnabled());
});

test('stale drafts cannot overwrite newer committed instructions', async () => {
  const agent = loadAgentFixture('original-scheduler');
  const onSave = vi.fn();
  const onSelect = vi.fn();
  const { rerender } = render(
    <AgentInspector agent={agent} selectedNodeId="greeting" onSelect={onSelect} onSave={onSave} />,
  );
  fireEvent.change(screen.getByLabelText('Message 1 instructions'), { target: { value: 'Old draft' } });
  const newer = applyAgentOperations(agent, [
    { type: 'update_node', node: 'greeting', changes: { role_message: 'Newer instructions' } },
  ]);
  rerender(<AgentInspector agent={newer} selectedNodeId="greeting" onSelect={onSelect} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This step changed');
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByLabelText('Role instructions')).toHaveValue('Newer instructions');
});

test('one save includes agent and multiple step edits; invalid collection JSON survives navigation and cancel', async () => {
  const agent = loadAgentFixture('original-scheduler');
  const onSave = vi.fn().mockResolvedValue(undefined);
  const props = { agent, onSelect: vi.fn(), onSave };
  const { rerender } = render(<AgentInspector {...props} selectedNodeId={null} />);
  fireEvent.change(screen.getByLabelText('Agent name'), { target: { value: 'Manual clinic' } });
  rerender(<AgentInspector {...props} selectedNodeId="greeting" />);
  fireEvent.change(screen.getByLabelText('Message 1 instructions'), { target: { value: 'Welcome' } });
  rerender(
    <AgentInspector
      {...props}
      selectedNodeId="collect_details"
      selectedTransitionFunction="record_details"
    />,
  );
  fireEvent.click(screen.getByText('Advanced JSON'));
  fireEvent.change(screen.getByLabelText('Collected fields JSON'), { target: { value: '{broken' } });
  rerender(<AgentInspector {...props} selectedNodeId="confirm" />);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  rerender(
    <AgentInspector
      {...props}
      selectedNodeId="collect_details"
      selectedTransitionFunction="record_details"
    />,
  );
  expect(screen.getByLabelText('Collected fields JSON')).toHaveValue('{broken');
  fireEvent.change(screen.getByLabelText('Collected fields JSON'), {
    target: {
      value: JSON.stringify({
        properties: { insurance: { type: 'string', native: [null] } },
        required: ['insurance'],
      }),
    },
  });
  fireEvent.change(screen.getByLabelText('Function name'), { target: { value: 'renamed' } });
  rerender(
    <AgentInspector {...props} selectedNodeId="collect_details" selectedTransitionFunction="renamed" />,
  );
  fireEvent.change(screen.getByLabelText('Transition condition'), { target: { value: 'Collect insurance' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  const result = applyAgentOperations(agent, onSave.mock.calls[0][0]);
  expect(result.name).toBe('Manual clinic');
  expect(result.nodes[0].task_messages[0].content).toBe('Welcome');
  expect(result.nodes[1].edges[0]).toMatchObject({
    function: 'renamed',
    description: 'Collect insurance',
    required: ['insurance'],
  });
});

test('deleting a selected transition returns to its step and later updates address the surviving function', async () => {
  const agent = loadAgentFixture('original-scheduler');
  agent.nodes[0].edges.push({ ...agent.nodes[0].edges[0], function: 'survivor' });
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onSelect = vi.fn();
  const props = { agent, onSave, onSelect, selectedNodeId: 'greeting' };
  const { rerender } = render(<AgentInspector {...props} selectedTransitionFunction="choose_intent" />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete transition' }));
  expect(onSelect).toHaveBeenCalledWith('greeting');
  rerender(<AgentInspector {...props} selectedTransitionFunction={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'Connections' }));
  fireEvent.change(screen.getByLabelText('Transition condition'), {
    target: { value: 'Surviving transition' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(applyAgentOperations(agent, onSave.mock.calls[0][0]).nodes[0].edges).toEqual([
    { ...agent.nodes[0].edges[1], description: 'Surviving transition' },
  ]);
});

test('scheduler field summaries distinguish choices and text, and unfinished edits follow their transition', () => {
  const agent = loadAgentFixture('original-scheduler');
  const props = { agent, onSave: vi.fn(), onSelect: vi.fn() };
  const { rerender } = render(
    <AgentInspector {...props} selectedNodeId="greeting" selectedTransitionFunction="choose_intent" />,
  );
  expect(screen.getByRole('button', { name: /^Intent Choice/ })).toBeVisible();
  rerender(
    <AgentInspector
      {...props}
      selectedNodeId="collect_details"
      selectedTransitionFunction="record_details"
    />,
  );
  expect(screen.getByRole('button', { name: /^Full name Text/ })).toBeVisible();
  expect(screen.getByRole('button', { name: /^Reason Text/ })).toBeVisible();
  rerender(
    <AgentInspector {...props} selectedNodeId="offer_times" selectedTransitionFunction="select_time" />,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Slot Choice/ }));
  expect(screen.getByLabelText('Answer type')).toHaveTextContent('Choice');
  fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'Monday 9 AM' } });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Function name'), { target: { value: 'new_time' } });
  rerender(<AgentInspector {...props} selectedNodeId="confirm" />);
  fireEvent.submit(screen.getByRole('form'));
  expect(props.onSave).not.toHaveBeenCalled();
  rerender(<AgentInspector {...props} selectedNodeId="offer_times" selectedTransitionFunction="new_time" />);
  expect(screen.getByLabelText('Option 1')).toHaveValue('Monday 9 AM');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel field' }));
  fireEvent.click(screen.getByRole('button', { name: /^Slot Choice/ }));
  expect(screen.getByLabelText('Option 1')).not.toHaveValue('Monday 9 AM');
});

test('visual Slot creation stages exact JSON only after Done and reports invalid input inline', async () => {
  const agent = loadAgentFixture('original-scheduler');
  agent.nodes[2].edges[0].properties = {};
  agent.nodes[2].edges[0].required = [];
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <AgentInspector
      agent={agent}
      onSave={onSave}
      onSelect={vi.fn()}
      selectedNodeId="offer_times"
      selectedTransitionFunction="select_time"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add information' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByText('Enter a field key.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Information name'), { target: { value: 'Slot' } });
  fireEvent.change(screen.getByLabelText('Field description'), {
    target: { value: 'The chosen appointment slot.' },
  });
  fireEvent.click(screen.getByLabelText('Answer type'));
  fireEvent.pointerDown(await screen.findByRole('option', { name: 'Choice' }));
  fireEvent.click(screen.getByRole('option', { name: 'Choice' }));
  for (const [index, option] of ['Tuesday 10 AM', 'Thursday 2 PM'].entries()) {
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    fireEvent.change(screen.getByLabelText(`Option ${index + 1}`), { target: { value: option } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(JSON.parse((screen.getByLabelText('Collected fields JSON') as HTMLTextAreaElement).value)).toEqual({
    properties: {
      slot: {
        type: 'string',
        description: 'The chosen appointment slot.',
        enum: ['Tuesday 10 AM', 'Thursday 2 PM'],
      },
    },
    required: ['slot'],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
});
