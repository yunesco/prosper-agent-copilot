// Real WebRTC/STT/LLM/TTS call, with a silent synthetic microphone.
// No spoken input is needed: the terminal agent must say the saved marker.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '../../frontend/node_modules/playwright-core/index.mjs';
const result = { scenario: 'saved-context', passed: false, identity: null, payloadMatches: false, receivedAudio: false, transcript: '', error: null };
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.setDefaultTimeout(20_000);
await page.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    const silence = context.createConstantSource();
    silence.offset.value = 0; silence.connect(destination); silence.start();
    await context.resume();
    window.syntheticContext = context;
    return destination.stream;
  };
});
let sentAgent;
page.on('request', request => {
  if (request.url().endsWith('/api/runtime/call') && request.method() === 'POST') sentAgent = request.postDataJSON().agent;
});
try {
  await page.goto(process.env.VOICE_FRONTEND_URL || 'http://localhost:3000');
  await page.getByRole('button', { name: 'Inspect start', exact: true }).click();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByLabel('Message 1 instructions').fill('Immediately say exactly: "The saved violet lighthouse is ready." Then say goodbye and end the call. Do not ask questions.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Changes saved' }).waitFor();
  await page.reload();
  const saved = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('prosper.agents.v1'));
    return doc.agents.find(record => record.id === doc.selectedId);
  });
  result.identity = { id: saved.id, revision: saved.revision };
  await page.getByRole('button', { name: 'Inspect start', exact: true }).click();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByLabel('Message 1 instructions').fill('Say exactly: "The unsaved orange submarine is ready."');
  await page.getByRole('button', { name: 'Test Call', exact: true }).click();
  await page.getByText('Unsaved drafts are excluded from Test Call.').waitFor();
  await page.getByRole('button', { name: 'Start call', exact: true }).click();
  await page.getByRole('log').getByText(/saved violet lighthouse/i).waitFor({ timeout: 60_000 });
  result.transcript = await page.getByRole('log').innerText();
  assert.deepEqual(sentAgent, saved.agent);
  result.payloadMatches = true;
  assert(!/orange submarine/i.test(result.transcript));
  result.receivedAudio = await page.locator('audio').evaluate(audio => audio.currentTime > 0);
  assert(result.receivedAudio, 'Expected actual incoming audio playback');
  result.passed = true;
} catch (error) { result.error = error.message; }
finally {
  await page.getByRole('button', { name: /^(End call|Cancel call)$/ }).click().catch(() => {});
  await page.evaluate(() => window.syntheticContext?.close()).catch(() => {});
  await browser.close();
  const directory = new URL('../results/', import.meta.url);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(new URL('saved-context.json', directory), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
if (!result.passed) process.exitCode = 1;
