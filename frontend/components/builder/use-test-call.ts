'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { SavedAgent } from '@/lib/agent/repository';
import { createVoiceCall, type TranscriptLine } from '@/lib/runtime/voice';

export function useTestCall(record: SavedAgent, audio: RefObject<HTMLAudioElement | null>) {
  const generation = useRef(0);
  const [identity, setIdentity] = useState<{ id: string; revision: number } | null>(null);
  const session = useRef<ReturnType<typeof createVoiceCall> | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended' | 'error'>('idle');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  useEffect(
    () => () => {
      generation.current += 1;
      session.current?.stop();
    },
    [],
  );
  const stop = () => {
    generation.current += 1;
    session.current?.stop();
    session.current = null;
    setStatus('ended');
  };
  const start = () => {
    if (session.current || !audio.current) return;
    const token = ++generation.current;
    const snapshot = structuredClone(record);
    setIdentity({ id: snapshot.id, revision: snapshot.revision });
    setError('');
    setTranscript([]);
    setStatus('connecting');
    const call = createVoiceCall(audio.current, {
      connected: () => {
        if (generation.current === token) setStatus('connected');
      },
      transcript: line => {
        if (generation.current !== token) return;
        setTranscript(lines => {
          const index =
            line.role === 'assistant' && line.segment !== undefined
              ? lines.findIndex(
                  existing => existing.role === 'assistant' && existing.segment === line.segment,
                )
              : -1;
          return index < 0 ? [...lines, line] : lines.map((existing, i) => (i === index ? line : existing));
        });
      },
      failed: message => {
        if (generation.current !== token) return;
        generation.current += 1;
        session.current = null;
        setError(message);
        setStatus('error');
      },
    });
    session.current = call;
    void call.start(snapshot.agent);
  };
  return {
    identity,
    status,
    error,
    transcript,
    start,
    stop,
    active: status === 'connecting' || status === 'connected',
  };
}
