'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AgentConfig } from '@/lib/agent/schema';
import { createVoiceCall, type TranscriptLine } from '@/lib/runtime/voice';

export function useTestCall(agent: AgentConfig, audio: RefObject<HTMLAudioElement | null>) {
  const session = useRef<ReturnType<typeof createVoiceCall> | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended' | 'error'>('idle');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  useEffect(() => () => session.current?.stop(), []);
  const stop = () => { session.current?.stop(); session.current = null; setStatus('ended'); };
  const start = () => {
    if (session.current || !audio.current) return;
    setError(''); setTranscript([]); setStatus('connecting');
    const call = createVoiceCall(audio.current, {
      connected: () => setStatus('connected'),
      transcript: line => setTranscript(lines => {
        const index = line.role === 'assistant' && line.segment !== undefined
          ? lines.findIndex(existing => existing.role === 'assistant' && existing.segment === line.segment)
          : -1;
        return index < 0 ? [...lines, line] : lines.map((existing, i) => i === index ? line : existing);
      }),
      failed: message => { session.current = null; setError(message); setStatus('error'); },
    });
    session.current = call;
    void call.start(agent);
  };
  return { status, error, transcript, start, stop, active: status === 'connecting' || status === 'connected' };
}
