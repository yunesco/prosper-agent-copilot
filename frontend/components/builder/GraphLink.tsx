'use client';

import { Button } from '@/components/ui/Button';
import { referenceExists, type GraphReference } from '@/lib/agent/proposals';
import type { SavedAgent } from '@/lib/agent/repository';

export function GraphLink({
  reference,
  record,
  onFocus,
}: {
  reference: GraphReference;
  record: SavedAgent;
  onFocus: (ref: GraphReference) => void;
}) {
  const label =
    reference.kind === 'transition' ? `${reference.node} → ${reference.function}` : reference.node;
  return referenceExists(record.agent, reference) ? (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto min-w-0 max-w-full whitespace-normal px-0 text-left [overflow-wrap:anywhere]"
      onClick={() => onFocus(reference)}
    >
      {label}
    </Button>
  ) : (
    <span className="text-xs text-text-muted [overflow-wrap:anywhere]">
      {label} — unavailable in current graph
    </span>
  );
}
