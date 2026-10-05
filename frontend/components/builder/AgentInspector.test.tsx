// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { applyAgentOperations } from '@/lib/agent/operations';
import { AgentInspector } from './AgentInspector';

afterEach(cleanup);

test('instructions edit in place while important settings stay exposed', () => {
  const agent = loadAgentFixture('original-scheduler');
  render(<AgentInspector agent={agent} selectedNodeId="collect_details" onSelect={vi.fn()} onSave={vi.fn()} />);
  expect(screen.getByRole('textbox', { name: 'Message 1 instructions' })).toHaveValue(String(agent.nodes[1].task_messages[0].content));
  expect(screen.queryByRole('button', { name: 'Edit instructions' })).not.toBeInTheDocument();
  expect(screen.queryByText('Advanced details')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Role instructions')).toHaveValue(agent.persona);
  expect(screen.getByText(agent.model)).toBeVisible();
  expect(screen.getByText(agent.voice_id)).toBeVisible();
  expect(screen.getByText('Step behavior')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('text edits preserve structured messages, native metadata, actions and fields', async () => {
  const agent = loadAgentFixture('original-scheduler');
  const node = agent.nodes[1];
  node.task_messages[0].metadata = { nested: [true, null] };
  node.task_messages.push({ role: 'assistant', content: [{ type: 'text', text: 'Native message' }], tool_calls: [] });
  const before = structuredClone(agent);
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<AgentInspector agent={agent} selectedNodeId={node.name} onSelect={vi.fn()} onSave={onSave} />);
  expect(screen.getAllByText(/Native message/, { selector: 'pre' })[0]).toBeVisible();
  fireEvent.change(screen.getByLabelText('Message 1 instructions'), { target: { value: 'New goal' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  const candidate = applyAgentOperations(agent, onSave.mock.calls[0][0]);
  expect(candidate.nodes[1]).toEqual({ ...node, task_messages: [{ ...node.task_messages[0], content: 'New goal' }, node.task_messages[1]] });
  expect(agent).toEqual(before);
});

test('drafts survive selection and tab changes; Escape cancels without leaving the step', () => {
  const agent = loadAgentFixture('original-scheduler');
  const onSelect = vi.fn();
  const onSave = vi.fn();
  const { rerender } = render(<AgentInspector agent={agent} selectedNodeId="collect_details" onSelect={onSelect} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText('Message 1 instructions'), { target: { value: 'Draft' } });
  rerender(<AgentInspector agent={agent} selectedNodeId="confirm" onSelect={onSelect} onSave={onSave} />);
  expect(screen.getByLabelText('Message 1 instructions')).not.toHaveValue('Draft');
  rerender(<AgentInspector agent={agent} selectedNodeId="collect_details" onSelect={onSelect} onSave={onSave} />);
  expect(screen.getByLabelText('Message 1 instructions')).toHaveValue('Draft');
  fireEvent.click(screen.getByRole('button', { name: 'Transitions (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'General' }));
  fireEvent.keyDown(screen.getByLabelText('Message 1 instructions'), { key: 'Escape' });
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Message 1 instructions')).toHaveValue(String(agent.nodes[1].task_messages[0].content));
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
  expect(screen.getByLabelText('Message 1 instructions')).toHaveValue(String(agent.nodes[0].task_messages[0].content));
});

test('transition inspector exposes routing, tool name and collected fields together', async () => {
  const agent = loadAgentFixture('original-scheduler');
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onSelect = vi.fn();
  render(<AgentInspector agent={agent} selectedNodeId="collect_details" selectedTransitionIndex={0} onSelect={onSelect} onSave={onSave} />);
  expect(screen.getByText('Function call')).toBeVisible();
  expect(screen.getByText('record_details')).toBeVisible();
  expect(screen.getByText('full_name', { exact: true })).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Target node' })).toHaveValue('offer_times');
  fireEvent.change(screen.getByRole('combobox', { name: 'Target node' }), { target: { value: 'confirm' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Ready to confirm' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith([{ type: 'update_edge', node: 'collect_details', edge_index: 0, changes: { description: 'Ready to confirm', target: 'confirm' } }]));
  expect(agent.nodes[1].edges[0].target).toBe('offer_times');
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
  expect(screen.getByText('End conversation')).toBeVisible();
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
  const onSave = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<AgentInspector agent={agent} selectedNodeId="greeting" onSelect={vi.fn()} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText('Message 1 instructions'), { target: { value: 'Draft' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Node settings' }));
  expect(screen.getByLabelText('Message 1 instructions')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent.submit(screen.getByRole('form', { name: 'Node settings' }));
  expect(onSave).toHaveBeenCalledOnce();
  finish();
  await waitFor(() => expect(screen.getByLabelText('Message 1 instructions')).toBeEnabled());
});

test('stale drafts cannot overwrite newer committed instructions', async () => {
  const agent = loadAgentFixture('original-scheduler');
  const onSave = vi.fn();
  const onSelect = vi.fn();
  const { rerender } = render(<AgentInspector agent={agent} selectedNodeId="greeting" onSelect={onSelect} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText('Message 1 instructions'), { target: { value: 'Old draft' } });
  const newer = applyAgentOperations(agent, [{ type: 'update_node', node: 'greeting', changes: { role_message: 'Newer instructions' } }]);
  rerender(<AgentInspector agent={newer} selectedNodeId="greeting" onSelect={onSelect} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This step changed');
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByLabelText('Role instructions')).toHaveValue('Newer instructions');
});
