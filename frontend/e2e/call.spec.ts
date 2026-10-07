import { seedOriginal, openDetails } from './seed';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }, info) => {
  if (!info.title.startsWith('switching saved agents')) await seedOriginal(page);
});
import { agentSchema } from '../lib/agent/schema';

async function mockVoice(page: Page, microphone: 'allow' | 'deny' | 'pending' = 'allow') {
  await page.addInitScript(
    ({ microphone }) => {
      let stopped = 0;
      Object.defineProperty(window, 'stoppedTracks', { get: () => stopped });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async () => {
          if (microphone === 'deny') throw new DOMException('denied', 'NotAllowedError');
          if (microphone === 'pending') await new Promise(resolve => setTimeout(resolve, 700));
          return { getTracks: () => [{ stop: () => stopped++, addEventListener: () => {} }] };
        },
      });
      class Peer extends EventTarget {
        iceGatheringState = 'complete';
        connectionState = 'new';
        localDescription = { sdp: 'mock-offer' };
        onconnectionstatechange: (() => void) | null = null;
        channel = {
          readyState: 'open',
          onopen: null as (() => void) | null,
          onclose: null as (() => void) | null,
          onmessage: null as ((event: { data: string }) => void) | null,
          send: () => {},
          close: () => {},
        };
        constructor() {
          super();
          Object.defineProperty(window, 'disconnectVoice', {
            configurable: true,
            value: (state = 'failed') => {
              this.connectionState = state;
              this.onconnectionstatechange?.();
            },
          });
        }
        addTrack() {}
        createDataChannel() {
          Object.defineProperty(window, 'emitVoice', {
            configurable: true,
            value: (message: unknown) => {
              this.channel.onmessage?.({
                data: JSON.stringify({ label: 'rtvi-ai', ...(message as object) }),
              });
            },
          });
          return this.channel;
        }
        async createOffer() {
          return { sdp: 'mock-offer', type: 'offer' };
        }
        async setLocalDescription() {}
        async setRemoteDescription() {
          this.channel.onopen?.();
          for (const message of [
            { type: 'bot-ready' },
            { type: 'user-transcription', data: { text: 'I need an appointment.', final: true } },
            // A generated greeting that is interrupted before any playback must stay hidden.
            {
              type: 'bot-output',
              data: {
                text: 'Unspoken first greeting.',
                will_be_spoken: true,
                spoken_status: 'new',
                segment_id: 1,
                spoken_progress: { accumulated_text: '', remaining_text: 'Unspoken first greeting.' },
              },
            },
            {
              type: 'bot-output',
              data: {
                text: 'I can help with scheduling.',
                will_be_spoken: true,
                spoken_status: 'new',
                segment_id: 2,
                spoken_progress: { accumulated_text: '', remaining_text: 'I can help with scheduling.' },
              },
            },
            ...['I can', 'I can help with scheduling.', 'I can help with scheduling.'].map(text => ({
              type: 'bot-output',
              data: {
                text: 'I can help with scheduling.',
                will_be_spoken: true,
                spoken_status: text === 'I can' ? 'in-progress' : 'completed',
                segment_id: 2,
                spoken_progress: {
                  accumulated_text: text,
                  remaining_text: text === 'I can' ? ' help with scheduling.' : '',
                },
              },
            })),
          ])
            this.channel.onmessage?.({ data: JSON.stringify({ label: 'rtvi-ai', ...message }) });
        }
        close() {
          this.connectionState = 'closed';
          this.onconnectionstatechange?.();
        }
      }
      Object.defineProperty(window, 'RTCPeerConnection', { value: Peer });
    },
    { microphone },
  );
}

for (const width of [1440]) {
  test(`call saved graph, edit, call again and retain builder at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await mockVoice(page);
    const agents: unknown[] = [];
    await page.route('**/api/runtime/call', async route => {
      agents.push(route.request().postDataJSON().agent);
      await route.fulfill({ json: { sdp: 'answer', type: 'answer', pc_id: 'test' } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Inspect collect_details', exact: true }).click();
    await page.getByRole('button', { name: 'Test Call', exact: true }).click();
    await page.getByRole('button', { name: 'Start call', exact: true }).click();
    await expect(page.getByText('Call connected', { exact: true })).toBeVisible();
    // The saved graph stays visible and follows the agent's live transitions.
    const collect = page.getByRole('button', { name: 'Inspect collect_details', exact: true });
    // Steps appear on the graph as the call reaches them, so a step not yet visited is not drawn.
    await expect(collect).toHaveCount(0);
    await page.evaluate(() =>
      (window as unknown as { emitVoice: (message: unknown) => void }).emitVoice({
        type: 'server-message',
        data: { type: 'node-active', node: 'collect_details' },
      }),
    );
    await expect(collect).toHaveAttribute('aria-current', 'step');
    await page.evaluate(() =>
      (window as unknown as { emitVoice: (message: unknown) => void }).emitVoice({
        type: 'server-message',
        data: {
          type: 'tool-call',
          tool: 'check_availability',
          arguments: { patient_type: 'new' },
          result: { slots: [{ label: 'Monday, October 12 at 9:00 AM' }] },
        },
      }),
    );
    await page.screenshot({ path: info.outputPath(`call-${width}.png`) });
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByTestId('tool-call')).toContainText(
      'check_availability → 1 open: Monday, October 12 at 9:00 AM',
    );
    await expect(page.getByRole('log')).toContainText('I need an appointment.');
    await expect(page.getByRole('log').getByText('I can help with scheduling.', { exact: true })).toHaveCount(
      1,
    );
    await expect(page.getByRole('log')).not.toContainText('Unspoken first greeting.');
    await page.getByRole('button', { name: 'Builder', exact: true }).click();
    await expect.poll(() => page.evaluate('window.stoppedTracks')).toBe(1);
    const goal = page.getByRole('textbox', { name: 'Message 1 instructions' });
    await openDetails(page);
    await goal.fill('Say: This is the edited call. Then collect name and DOB.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
    await page.reload();
    const savedPayload = await page.evaluate(() => {
      const doc = JSON.parse(localStorage.getItem('prosper.agents.v1')!);
      return doc.agents.find((record: { id: string }) => record.id === doc.selectedId).agent;
    });
    await page.getByRole('button', { name: 'Inspect collect_details', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await openDetails(page);
    await goal.fill('An unsaved draft must not reach voice.');
    await page.getByRole('button', { name: 'Test Call', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('button', { name: 'Start call', exact: true }).click();
    await expect(page.getByText('Call connected', { exact: true })).toBeVisible();
    await expect(page.getByText('Saved agent original-scheduler · Revision 2')).toBeVisible();
    await expect(page.getByText('Unsaved drafts are excluded from Test Call.')).toBeVisible();
    expect(agents).toHaveLength(2);
    expect(agents[1]).toEqual(savedPayload);
    const first = agentSchema.parse(agents[0]);
    const second = agentSchema.parse(agents[1]);
    expect(first.nodes.find(node => node.name === 'collect_details')?.task_messages).not.toEqual(
      second.nodes.find(node => node.name === 'collect_details')!.task_messages,
    );
    expect(second.nodes.find(node => node.name === 'collect_details')!.task_messages[0].content).toBe(
      'Say: This is the edited call. Then collect name and DOB.',
    );
    await page.getByRole('button', { name: 'End call', exact: true }).click();
    await expect(page.getByText('Call ended', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Builder', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(goal).toHaveValue('An unsaved draft must not reach voice.');
  });
}

test('denied microphone is recoverable and never reaches voice API', async ({ page }) => {
  await mockVoice(page, 'deny');
  let calls = 0;
  page.on('request', request => {
    if (request.url().endsWith('/api/runtime/call')) calls++;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Test Call' }).click();
  await page.getByRole('button', { name: 'Start call' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Microphone permission denied');
  await expect(page.getByRole('button', { name: 'Start call' })).toBeEnabled();
  expect(calls).toBe(0);
});

test('runtime rejection, unavailability, disconnect and retry', async ({ page }) => {
  await mockVoice(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Test Call' }).click();
  await page.route('**/api/runtime/call', route =>
    route.fulfill({ status: 422, json: { error: 'Invalid graph: unknown node' } }),
  );
  await page.getByRole('button', { name: 'Start call' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Invalid graph');
  await page.unroute('**/api/runtime/call');
  await page.route('**/api/runtime/call', route => route.abort());
  await page.getByRole('button', { name: 'Start call' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Voice runtime unavailable');
  await page.unroute('**/api/runtime/call');
  await page.route('**/api/runtime/call', route =>
    route.fulfill({ json: { sdp: 'answer', type: 'answer', pc_id: 'test' } }),
  );
  await page.getByRole('button', { name: 'Start call' }).click();
  await expect(page.getByText('Call connected', { exact: true })).toBeVisible();
  await page.evaluate("window.disconnectVoice('disconnected')");
  await expect(page.getByText('Call connected', { exact: true })).toBeVisible();
  expect(await page.evaluate('window.stoppedTracks')).toBe(2);
  await page.evaluate("window.disconnectVoice('connected')");
  await expect(page.getByText('Call connected', { exact: true })).toBeVisible();
  await page.evaluate('window.disconnectVoice()');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Call disconnected');
  await expect.poll(() => page.evaluate('window.stoppedTracks')).toBe(3);
});

test('switching saved agents stops active calls, clears context and releases tracks', async ({ page }) => {
  await mockVoice(page);
  const agents: unknown[] = [];
  await page.route('**/api/runtime/call', route => {
    agents.push(route.request().postDataJSON().agent);
    return route.fulfill({ json: { sdp: 'answer', type: 'answer', pc_id: 'test' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Test Call', exact: true }).click();
  await page.getByRole('button', { name: 'Start call', exact: true }).click();
  await expect(page.getByText('Call connected', { exact: true })).toBeVisible();
  await page.getByLabel('Saved agent', { exact: true }).click();
  await page
    .getByRole('group', { name: 'Agents' })
    .getByRole('button', { name: /^Riverside Family Clinic/ })
    .click();
  await expect(page.getByRole('button', { name: 'Builder', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect.poll(() => page.evaluate('window.stoppedTracks')).toBe(1);
  await page.getByRole('button', { name: 'Test Call', exact: true }).click();
  await expect(page.getByRole('log')).not.toContainText('I need an appointment.');
  await page.getByRole('button', { name: 'Start call', exact: true }).click();
  await expect(page.getByText('Saved agent riverside-family-clinic · Revision 1')).toBeVisible();
  await expect(page.getByText('Call connected', { exact: true })).toBeVisible();
  expect(agentSchema.parse(agents[0]).initial_node).toBe('start');
  expect(agentSchema.parse(agents[1]).name).toBe('Riverside Family Clinic');
  // Stay in the same document: a hard navigation resets the injected track counter.
  await page.getByRole('button', { name: 'Builder', exact: true }).click();
  await expect.poll(() => page.evaluate('window.stoppedTracks')).toBe(2);
});
