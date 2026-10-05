// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { AgentInspector } from './AgentInspector';

afterEach(cleanup);
test('shows every message including native structured payloads and follows a target without mutation', () => {
  const agent = loadAgentFixture('original-scheduler');
  agent.nodes[1].task_messages.push({ role: 'assistant', content: [{ type: 'text', text: 'Native message' }], tool_calls: [] }, { role: 'user', content: '' });
  const before = structuredClone(agent);
  const onSelect = vi.fn();
  render(<AgentInspector agent={agent} selectedNodeId="collect_details" onSelect={onSelect} />);
  expect(screen.getByText(/Collect the caller's full name/, { selector: 'p' })).toBeVisible();
  expect(screen.getAllByText(/Native message/, { selector: 'pre' })[0]).toBeVisible();
  expect(screen.getByText('Empty content.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Transitions (1)' }));
  fireEvent.click(screen.getByRole('button', { name: '→ offer_times' }));
  expect(onSelect).toHaveBeenCalledWith('offer_times');
  fireEvent.click(screen.getByRole('button', { name: 'Agent overview' }));
  expect(onSelect).toHaveBeenCalledWith(null);
  expect(agent).toEqual(before);
});
test('empty and terminal nodes have explicit read-only states', () => {
  const agent = loadAgentFixture('original-scheduler');
  agent.nodes[3].task_messages = [];
  render(<AgentInspector agent={agent} selectedNodeId="confirm" onSelect={vi.fn()} />);
  expect(screen.getByText('No task messages.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Transitions (0)' }));
  expect(screen.getByText('No outgoing transitions.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'General' }));
  fireEvent.click(screen.getByText('Advanced details'));
  expect(screen.getByText('confirm · Terminal')).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('transition inspector reflects backend tool fields and has no unsupported routing controls', () => {
  const agent = loadAgentFixture('original-scheduler');
  const onSelect = vi.fn();
  render(<AgentInspector agent={agent} selectedNodeId="collect_details" selectedTransitionIndex={0} onSelect={onSelect} />);
  expect(screen.getByText('Function call')).toBeVisible();
  expect(screen.getByText('record_details')).toBeVisible();
  expect(screen.getByText('full_name', { exact: true })).toBeVisible();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Offer times' }));
  expect(onSelect).toHaveBeenCalledWith('offer_times');
});

test('explicit post-actions do not falsely promise automatic hangup', () => {
  const agent = loadAgentFixture('original-scheduler');
  agent.nodes[3].post_actions = [{ type: 'tts_say', text: 'Synthetic action' }];
  render(<AgentInspector agent={agent} selectedNodeId="confirm" onSelect={vi.fn()} />);
  expect(screen.queryByText('Conversation ends after this step.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Advanced details'));
  expect(screen.getByText('Explicit post-actions replace the default end-conversation action.')).toBeVisible();
});
