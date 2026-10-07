import { z } from 'zod';
import type { AgentConfig } from '@/lib/agent/schema';
import { requestCallAnswer } from './call-api';
import { toolSummary } from './tool-summary';

export type TranscriptLine = {
  role: 'user' | 'assistant';
  text: string;
  segment?: number;
  node?: string;
  /** Set for a tool call the agent made (text is the one-line result), not for speech. */
  tool?: string;
};
const eventSchema = z.object({ label: z.literal('rtvi-ai'), type: z.string(), data: z.unknown().optional() });
const userText = z.object({ text: z.string(), final: z.boolean() });
const toolCall = z.object({ type: z.literal('tool-call'), tool: z.string(), result: z.unknown() });
const nodeActive = z.object({ type: z.literal('node-active'), node: z.string() });
const botText = z.object({
  text: z.string(),
  segment_id: z.number(),
  will_be_spoken: z.boolean(),
  spoken_status: z.enum(['new', 'in-progress', 'completed']),
  spoken_progress: z.object({ accumulated_text: z.string() }),
});

/** SmallWebRTC/RTVI v2 boundary. No provider keys or product state live here. */
export function createVoiceCall(
  audio: HTMLAudioElement,
  callbacks: {
    connected: () => void;
    transcript: (line: TranscriptLine) => void;
    /** The step the agent just moved to. The first step is implied by `connected`. */
    node?: (name: string) => void;
    /** Fires for every bot-output, including generated text that is not yet spoken. */
    segmentStarted?: (segment: number) => void;
    failed: (message: string) => void;
  },
) {
  let peer: RTCPeerConnection | undefined;
  let stream: MediaStream | undefined;
  let channel: RTCDataChannel | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const abort = new AbortController();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    abort.abort();
    clearInterval(heartbeat);
    clearTimeout(deadline);
    if (channel?.readyState === 'open')
      channel.send(JSON.stringify({ label: 'rtvi-ai', type: 'disconnect-bot', id: crypto.randomUUID() }));
    channel?.close();
    peer?.close();
    stream?.getTracks().forEach(track => track.stop());
    audio.pause();
    audio.srcObject = null;
  };
  const fail = (message: string) => {
    if (!stopped) {
      stop();
      callbacks.failed(message);
    }
  };
  return {
    stop,
    async start(agent: AgentConfig) {
      deadline = setTimeout(() => fail('The call timed out. Check the voice runtime and try again.'), 30_000);
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('Microphone access requires localhost or HTTPS.');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        if (stopped) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        peer = new RTCPeerConnection();
        peer.ontrack = event => {
          audio.srcObject = new MediaStream([event.track]);
          void audio
            .play()
            .catch(() => fail('Audio playback was blocked. Allow audio in your browser and try again.'));
        };
        peer.onconnectionstatechange = () => {
          if (peer && ['failed', 'closed'].includes(peer.connectionState))
            fail('Call disconnected. You can start a new call.');
        };
        // An unplugged or revoked microphone ends its track without closing the peer connection.
        stream.getTracks().forEach(track => {
          track.addEventListener('ended', () =>
            fail('Microphone disconnected. Check your input device and start a new call.'),
          );
          peer?.addTrack(track, stream!);
        });
        channel = peer.createDataChannel('chat');
        channel.onopen = () => {
          if (stopped) return;
          channel?.send('ping');
          heartbeat = setInterval(() => {
            if (channel?.readyState === 'open') channel.send('ping');
          }, 1000);
          channel?.send(
            JSON.stringify({
              label: 'rtvi-ai',
              type: 'client-ready',
              id: crypto.randomUUID(),
              data: { version: '2.0.0', about: { library: 'prosper-builder' } },
            }),
          );
        };
        channel.onclose = () => fail('Call disconnected. You can start a new call.');
        channel.onmessage = event => {
          if (stopped || typeof event.data !== 'string') return;
          let raw: unknown;
          try {
            raw = JSON.parse(event.data);
          } catch {
            return;
          }
          const parsed = eventSchema.safeParse(raw);
          if (!parsed.success) return;
          const message = parsed.data;
          if (message.type === 'bot-ready') {
            clearTimeout(deadline);
            callbacks.connected();
          }
          if (message.type === 'error')
            fail('The voice service reported an error. Check the backend and try again.');
          if (message.type === 'user-transcription') {
            const text = userText.safeParse(message.data);
            if (text.success && text.data.final) callbacks.transcript({ role: 'user', text: text.data.text });
          }
          if (message.type === 'server-message') {
            const event = nodeActive.safeParse(message.data);
            if (event.success) callbacks.node?.(event.data.node);
            const tool = toolCall.safeParse(message.data);
            if (tool.success)
              callbacks.transcript({
                role: 'assistant',
                text: toolSummary(tool.data.tool, tool.data.result),
                tool: tool.data.tool,
              });
          }
          if (message.type === 'bot-output') {
            const text = botText.safeParse(message.data);
            if (text.success) callbacks.segmentStarted?.(text.data.segment_id);
            // 'new' contains generated text, including audio that may be interrupted
            // before playback. Progress is cumulative for this segment, not a new line.
            if (
              text.success &&
              text.data.will_be_spoken &&
              text.data.spoken_status !== 'new' &&
              text.data.spoken_progress.accumulated_text.trim()
            ) {
              callbacks.transcript({
                role: 'assistant',
                text: text.data.spoken_progress.accumulated_text,
                segment: text.data.segment_id,
              });
            }
          }
        };
        await peer.setLocalDescription(await peer.createOffer());
        // Send complete ICE candidates in the SDP; no separate trickle endpoint needed.
        if (peer.iceGatheringState !== 'complete')
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              peer?.removeEventListener('icegatheringstatechange', changed);
              abort.signal.removeEventListener('abort', cancelled);
            };
            const changed = () => {
              if (peer?.iceGatheringState === 'complete') {
                cleanup();
                resolve();
              }
            };
            const cancelled = () => {
              cleanup();
              reject(new Error('Call cancelled.'));
            };
            peer?.addEventListener('icegatheringstatechange', changed);
            abort.signal.addEventListener('abort', cancelled, { once: true });
            if (abort.signal.aborted) cancelled();
            else changed();
          });
        if (stopped) return;
        const answer = await requestCallAnswer(
          { agent, sdp: peer.localDescription!.sdp, type: 'offer' },
          { signal: abort.signal },
        );
        if (!stopped) await peer.setRemoteDescription({ type: answer.type, sdp: answer.sdp });
      } catch (error) {
        fail(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Microphone permission denied. Allow microphone access in your browser and try again.'
            : error instanceof Error
              ? error.message
              : 'Unable to start the call.',
        );
      }
    },
  };
}
