import { expect, test, type Page } from '@playwright/test';
import { agentSchema } from '../lib/agent/schema';

async function mockVoice(page: Page, microphone: 'allow' | 'deny' | 'pending' = 'allow') {
  await page.addInitScript(({ microphone }) => {
    let stopped = 0;
    Object.defineProperty(window, 'stoppedTracks', { get: () => stopped });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      if (microphone === 'deny') throw new DOMException('denied', 'NotAllowedError');
      if (microphone === 'pending') await new Promise(resolve => setTimeout(resolve, 700));
      return { getTracks: () => [{ stop: () => stopped++ }] };
    } });
    class Peer extends EventTarget {
      iceGatheringState = 'complete';
      connectionState = 'new';
      localDescription = { sdp: 'mock-offer' };
      onconnectionstatechange: (() => void) | null = null;
      channel = { readyState: 'open', onopen: null as (() => void) | null, onclose: null as (() => void) | null, onmessage: null as ((event: { data: string }) => void) | null, send: () => {}, close: () => {} };
      constructor() { super(); Object.defineProperty(window, 'disconnectVoice', { configurable: true, value: (state = 'failed') => { this.connectionState = state; this.onconnectionstatechange?.(); } }); }
      addTrack() {}
      createDataChannel() { return this.channel; }
      async createOffer() { return { sdp: 'mock-offer', type: 'offer' }; }
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.channel.onopen?.();
        for (const message of [
          { type: 'bot-ready' },
          { type: 'user-transcription', data: { text: 'I need an appointment.', final: true } },
          // A generated greeting that is interrupted before any playback must stay hidden.
          { type: 'bot-output', data: { text: 'Unspoken first greeting.', will_be_spoken: true, spoken_status: 'new', segment_id: 1, spoken_progress: { accumulated_text: '', remaining_text: 'Unspoken first greeting.' } } },
          { type: 'bot-output', data: { text: 'I can help with scheduling.', will_be_spoken: true, spoken_status: 'new', segment_id: 2, spoken_progress: { accumulated_text: '', remaining_text: 'I can help with scheduling.' } } },
          ...['I can', 'I can help with scheduling.', 'I can help with scheduling.'].map(text => ({ type: 'bot-output', data: { text: 'I can help with scheduling.', will_be_spoken: true, spoken_status: text === 'I can' ? 'in-progress' : 'completed', segment_id: 2, spoken_progress: { accumulated_text: text, remaining_text: text === 'I can' ? ' help with scheduling.' : '' } } })),
        ]) this.channel.onmessage?.({ data: JSON.stringify({ label: 'rtvi-ai', ...message }) });
      }
      close() { this.connectionState = 'closed'; this.onconnectionstatechange?.(); }
    }
    Object.defineProperty(window, 'RTCPeerConnection', { value: Peer });
  }, { microphone });
}

for (const width of [1440, 390]) {
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
    await page.screenshot({ path: info.outputPath(`call-${width}.png`) });
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByRole('log')).toContainText('I need an appointment.');
    await expect(page.getByRole('log').getByText('I can help with scheduling.', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('log')).not.toContainText('Unspoken first greeting.');
    await page.getByRole('button', { name: 'Builder', exact: true }).click();
    await expect.poll(() => page.evaluate('window.stoppedTracks')).toBe(1);
    const goal = page.getByRole('textbox', { name: 'Message 1 instructions' });
    await goal.fill('Say: This is the edited call. Then collect name and DOB.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
    await goal.fill('An unsaved draft must not reach voice.');
    await page.getByRole('button', { name: 'Test Call', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Call', exact: true }).click();
    await page.getByRole('button', { name: 'Start call', exact: true }).click();
    await expect(page.getByText('Call connected', { exact: true })).toBeVisible();
    expect(agents).toHaveLength(2);
    const first = agentSchema.parse(agents[0]);
    const second = agentSchema.parse(agents[1]);
    expect(first.nodes.find(node => node.name === 'collect_details')?.task_messages).not.toEqual(second.nodes.find(node => node.name === 'collect_details')!.task_messages);
    expect(second.nodes.find(node => node.name === 'collect_details')!.task_messages[0].content).toBe('Say: This is the edited call. Then collect name and DOB.');
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
  page.on('request', request => { if (request.url().endsWith('/api/runtime/call')) calls++; });
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
  await page.route('**/api/runtime/call', route => route.fulfill({ status: 422, json: { error: 'Invalid graph: unknown node' } }));
  await page.getByRole('button', { name: 'Start call' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Invalid graph');
  await page.unroute('**/api/runtime/call');
  await page.route('**/api/runtime/call', route => route.abort());
  await page.getByRole('button', { name: 'Start call' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Voice runtime unavailable');
  await page.unroute('**/api/runtime/call');
  await page.route('**/api/runtime/call', route => route.fulfill({ json: { sdp: 'answer', type: 'answer', pc_id: 'test' } }));
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

test('cancel while permission is pending releases late microphone and does not start voice', async ({ page }) => {
  await mockVoice(page, 'pending');
  let calls = 0;
  page.on('request', request => { if (request.url().endsWith('/api/runtime/call')) calls++; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Test Call' }).click();
  await page.getByRole('button', { name: 'Start call' }).click();
  await page.getByRole('button', { name: 'Cancel call' }).click();
  await expect.poll(() => page.evaluate('window.stoppedTracks')).toBe(1);
  expect(calls).toBe(0);
  await expect(page.getByText('Call ended', { exact: true })).toBeVisible();
});
