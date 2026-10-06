import { useState } from 'react';
import type { GraphReference, Proposal } from '@/lib/agent/proposals';

/** Canvas preview state for the one proposal that is ready to Apply. Never touches saved or draft state. */
export function useProposalPreview(proposal: Proposal | undefined) {
  const [hidden, setHidden] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ id: string; reference: GraphReference | null } | null>(null);
  const [focus, setFocus] = useState<{ node: string; token: number } | null>(null);
  const previewing = !!proposal && hidden !== proposal.id;
  const reference = proposal && selection?.id === proposal.id ? selection.reference : null;
  const select = (next: GraphReference | null) => {
    if (proposal) setSelection({ id: proposal.id, reference: next });
  };
  return {
    previewing,
    reference,
    focus,
    select,
    show: () => setHidden(null),
    hide: () => proposal && setHidden(proposal.id),
    toggle: () => setHidden(previewing && proposal ? proposal.id : null),
    focusReference: (next: GraphReference) => {
      select(next);
      setFocus(value => ({ node: next.node, token: (value?.token ?? 0) + 1 }));
    },
  };
}
