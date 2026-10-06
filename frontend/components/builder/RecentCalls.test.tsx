// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadAgentFixture, callsForAgent } from '@/lib/fixtures';
import type { SavedAgent } from '@/lib/agent/repository';
import { getCall, listCalls, PlatformError } from '@/lib/platform/store';
import { CallDetails, RecentCalls } from './RecentCalls';

// The mock platform handlers' logic, reached without a server.
const platform = vi.fn(async (path: string) => {
  const [, agent, callId] = /\/api\/platform\/agents\/([^/]+)\/calls(?:\/([^/]+))?$/.exec(path)!;
  try {
    return Response.json(callId ? getCall(agent, callId) : listCalls(agent));
  } catch (error) {
    if (error instanceof PlatformError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
});
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', platform);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  platform.mockClear();
});
const record: SavedAgent = {
  id: 'clinic-scheduler',
  revision: 1,
  agent: loadAgentFixture('clinic-scheduler'),
  guidelines: '',
};

test('call rows load from the platform API, open the full call, and the transcript retains numbered evidence', async () => {
  const onOpen = vi.fn();
  const { unmount } = render(<RecentCalls record={record} onOpen={onOpen} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading calls');
  expect(await screen.findAllByRole('button')).toHaveLength(callsForAgent(record.id).length);
  expect(screen.getByText('Client reported')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Reported Friday booking issue/ }));
  const call = callsForAgent(record.id).find(call => !!call.client_feedback)!;
  await waitFor(() => expect(onOpen).toHaveBeenCalledExactlyOnceWith(call));
  unmount();
  render(<CallDetails call={call} record={record} onBack={vi.fn()} onFocus={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Back to agent details' })).toHaveFocus();
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  expect(screen.getAllByRole('listitem')).toHaveLength(call.transcript.length);
  expect(screen.getByText(call.transcript[0].text)).toBeVisible();
});

test('the generated agent has no calls, and platform failures are surfaced', async () => {
  const { unmount } = render(<RecentCalls record={{ ...record, id: 'new-agent' }} onOpen={vi.fn()} />);
  expect(await screen.findByText('No recent calls for this agent.')).toBeVisible();
  unmount();
  platform.mockResolvedValueOnce(new Response('{}', { status: 500 }));
  render(<RecentCalls record={record} onOpen={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load call data.');
});

test('another agent cannot expose a historical call', () => {
  const call = callsForAgent(record.id)[0];
  const { container } = render(
    <CallDetails call={call} record={{ ...record, id: 'new-agent' }} onBack={vi.fn()} onFocus={vi.fn()} />,
  );
  expect(container).toBeEmptyDOMElement();
});

test('historical graph links focus existing nodes and mark missing nodes unavailable', () => {
  const original = callsForAgent(record.id)[0];
  const call = { ...original, graph_path: [...original.graph_path, 'retired_step'] };
  const onFocus = vi.fn();
  render(<CallDetails call={call} record={record} onBack={vi.fn()} onFocus={onFocus} />);
  fireEvent.click(screen.getByRole('button', { name: 'offer_times' }));
  expect(onFocus).toHaveBeenCalledExactlyOnceWith({ kind: 'node', node: 'offer_times' });
  expect(screen.getByText('retired_step — unavailable in current graph')).toBeVisible();
  expect(screen.queryByRole('button', { name: /retired_step/ })).not.toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Transcript turns' })).toBeVisible();
  expect(screen.getByText(original.transcript[2].text)).toBeVisible();
});

test('successful calls show their recorded outcome without implying a behavior review', () => {
  const call = callsForAgent(record.id).find(call => call.outcome === 'successful')!;
  render(<CallDetails call={call} record={record} onBack={vi.fn()} onFocus={vi.fn()} />);
  expect(screen.getByText('Successful')).toBeVisible();
  expect(screen.getByText('Client feedback: None reported.')).toBeVisible();
  expect(screen.getByText(`${call.transcript.length} turns`)).toBeVisible();
  expect(screen.getByText(`Call ID: ${call.id}`)).toBeVisible();
});

test('Investigate and review actions are offered, and a cited turn is marked in the transcript', async () => {
  const call = callsForAgent(record.id).find(call => !!call.client_feedback)!;
  const onInvestigate = vi.fn(),
    onReview = vi.fn();
  const { unmount } = render(
    <CallDetails
      call={call}
      record={record}
      onBack={vi.fn()}
      onFocus={vi.fn()}
      onInvestigate={onInvestigate}
      highlightTurn={3}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Investigate with Copilot' }));
  expect(onInvestigate).toHaveBeenCalledOnce();
  expect(
    screen.getAllByRole('listitem').filter(item => item.getAttribute('aria-current') === 'true'),
  ).toHaveLength(1);
  expect(screen.getByText(call.transcript[2].text).closest('li')).toHaveAttribute('aria-current', 'true');
  unmount();
  render(<RecentCalls record={record} onOpen={vi.fn()} onReview={onReview} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review recent calls with Copilot' }));
  expect(onReview).toHaveBeenCalledOnce();
});
