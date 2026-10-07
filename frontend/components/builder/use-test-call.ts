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
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  // Steps reached so far, kept after the call so the path taken can be reviewed.
  const [visitedNodeIds, setVisitedNodeIds] = useState<string[]>([]);
  // Mirrors activeNodeId for callbacks, and pins each spoken segment to the step
  // that generated it: spoken text trails generation, so the step may have moved on.
  const activeNode = useRef<string | null>(null);
  const segmentNodes = useRef(new Map<number, string>());
  const moveTo = (node: string | null) => {
    activeNode.current = node;
    setActiveNodeId(node);
    if (node) setVisitedNodeIds(visited => (visited.includes(node) ? visited : [...visited, node]));
  };
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
    moveTo(null);
    setStatus('ended');
  };
  const start = () => {
    if (session.current || !audio.current) return;
    const token = ++generation.current;
    const snapshot = structuredClone(record);
    setIdentity({ id: snapshot.id, revision: snapshot.revision });
    setError('');
    setTranscript([]);
    moveTo(null);
    setVisitedNodeIds([]);
    segmentNodes.current.clear();
    setStatus('connecting');
    const call = createVoiceCall(audio.current, {
      connected: () => {
        if (generation.current !== token) return;
        moveTo(snapshot.agent.initial_node);
        setStatus('connected');
      },
      node: name => {
        if (generation.current === token) moveTo(name);
      },
      segmentStarted: segment => {
        if (generation.current !== token || segmentNodes.current.has(segment) || !activeNode.current) return;
        segmentNodes.current.set(segment, activeNode.current);
      },
      transcript: line => {
        if (generation.current !== token) return;
        const node =
          (line.segment !== undefined ? segmentNodes.current.get(line.segment) : undefined) ??
          activeNode.current ??
          undefined;
        const stamped = node ? { ...line, node } : line;
        setTranscript(lines => {
          const index =
            line.role === 'assistant' && line.segment !== undefined
              ? lines.findIndex(
                  existing => existing.role === 'assistant' && existing.segment === line.segment,
                )
              : -1;
          return index < 0
            ? [...lines, stamped]
            : lines.map((existing, i) => (i === index ? stamped : existing));
        });
      },
      failed: message => {
        if (generation.current !== token) return;
        generation.current += 1;
        session.current = null;
        moveTo(null);
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
    activeNodeId,
    visitedNodeIds,
    start,
    stop,
    active: status === 'connecting' || status === 'connected',
  };
}
