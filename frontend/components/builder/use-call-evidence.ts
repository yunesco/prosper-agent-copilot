import { useState } from 'react';
import type { ProductionCall } from '@/lib/platform/schema';
import { fetchCall } from '@/lib/runtime/platform';

/** The production call open in Details, optionally scrolled to a turn that Copilot cited. */
export function useCallEvidence(agentId: string, isActive: () => boolean) {
  const [call, setCall] = useState<ProductionCall | null>(null);
  const [turn, setTurn] = useState<number | null>(null);
  const [error, setError] = useState('');
  return {
    call,
    turn,
    error,
    open: (opened: ProductionCall) => {
      setTurn(null);
      setCall(opened);
    },
    close: () => {
      setCall(null);
      setTurn(null);
    },
    // A failed lookup leaves the current view untouched.
    openCited: async (callId: string, citedTurn: number) => {
      setError('');
      try {
        const opened = await fetchCall(agentId, callId);
        if (!isActive()) return false;
        setTurn(citedTurn);
        setCall(opened);
        return true;
      } catch (failure) {
        if (isActive()) setError(failure instanceof Error ? failure.message : 'Could not open the call.');
        return false;
      }
    },
  };
}
