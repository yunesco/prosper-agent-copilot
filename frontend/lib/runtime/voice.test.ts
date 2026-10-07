import { afterEach, expect, test, vi } from 'vitest';
import { loadAgentFixture } from '../fixtures';
import { createVoiceCall } from './voice';

vi.mock('./call-api', () => ({
  requestCallAnswer: vi.fn(async () => ({ type: 'answer', sdp: 'answer-sdp' })),
}));
afterEach(() => vi.unstubAllGlobals());

function fakeWebRtc() {
  const track = Object.assign(new EventTarget(), { stop: vi.fn(), kind: 'audio' });
  const stream = { getTracks: () => [track] };
  const channels: { onmessage: (event: { data: string }) => void }[] = [];
  class FakePeer extends EventTarget {
    iceGatheringState = 'complete';
    connectionState = 'new';
    localDescription = { sdp: 'offer-sdp' };
    onconnectionstatechange: (() => void) | null = null;
    ontrack: unknown = null;
    addTrack = vi.fn();
    createDataChannel = () => {
      const channel = { readyState: 'connecting', close: vi.fn(), send: vi.fn(), onmessage: () => {} };
      channels.push(channel);
      return channel;
    };
    createOffer = async () => ({ type: 'offer', sdp: 'offer-sdp' });
    setLocalDescription = async () => {};
    setRemoteDescription = vi.fn(async () => {});
    close = vi.fn();
  }
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  return { track, channels };
}
const audio = { pause: vi.fn(), play: vi.fn(async () => {}), srcObject: null } as unknown as HTMLAudioElement;

test('a microphone that ends mid-call ends the call with a visible, recoverable error', async () => {
  const { track } = fakeWebRtc();
  const failed = vi.fn();
  const call = createVoiceCall(audio, { connected: vi.fn(), transcript: vi.fn(), failed });
  await call.start(loadAgentFixture('clinic-scheduler'));
  track.dispatchEvent(new Event('ended'));
  expect(failed).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/microphone/i));
  expect(track.stop).toHaveBeenCalled();
});

test('hanging up while the microphone prompt is pending releases the late stream and never errors', async () => {
  const { track } = fakeWebRtc();
  let grant!: (stream: unknown) => void;
  (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockReturnValue(
    new Promise(resolve => (grant = resolve)),
  );
  const failed = vi.fn();
  const call = createVoiceCall(audio, { connected: vi.fn(), transcript: vi.fn(), failed });
  const started = call.start(loadAgentFixture('clinic-scheduler'));
  call.stop();
  grant({ getTracks: () => [track] });
  await started;
  expect(track.stop).toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
});

test('server node events and every bot segment reach the call; malformed node events are ignored', async () => {
  const { channels } = fakeWebRtc();
  const node = vi.fn();
  const segmentStarted = vi.fn();
  const call = createVoiceCall(audio, {
    connected: vi.fn(),
    transcript: vi.fn(),
    failed: vi.fn(),
    node,
    segmentStarted,
  });
  await call.start(loadAgentFixture('clinic-scheduler'));
  const emit = (type: string, data: unknown) =>
    channels[0].onmessage({ data: JSON.stringify({ label: 'rtvi-ai', type, data }) });
  emit('server-message', { type: 'node-active', node: 'collect_details' });
  emit('server-message', { type: 'node-active' });
  emit('server-message', { type: 'something-else', node: 'ignored' });
  emit('bot-output', {
    text: 'Hi',
    will_be_spoken: true,
    spoken_status: 'new',
    segment_id: 7,
    spoken_progress: { accumulated_text: '' },
  });
  expect(node).toHaveBeenCalledExactlyOnceWith('collect_details');
  expect(segmentStarted).toHaveBeenCalledExactlyOnceWith(7);
});
