'use client';

import { ChatPresentation } from '@/components/chat/ChatPresentation';
import { referenceExists, type GraphReference, type Proposal } from '@/lib/agent/proposals';
import type { SavedAgent } from '@/lib/agent/repository';
import type { Copilot } from './use-copilot';
import { copilotActivities } from './copilot-activity';
import { copilotEmptyState } from './copilot-prompts';
import { BehaviorReviewCard } from './BehaviorReviewCard';
import { EvidenceChip } from './EvidenceChip';
import { GraphLink } from './GraphLink';
import { ProposalCard } from './ProposalCard';
import { citationVerified, parseEvidenceHref, readCallTurns } from '@/lib/copilot/evidence';
import type { ReactNode } from 'react';

export function CopilotPane({
  copilot,
  record,
  selected,
  dirty,
  applying,
  error,
  onApply,
  onFocus,
  onTest,
  onPreview,
  onOpenCall,
}: {
  copilot: Copilot;
  record: SavedAgent;
  selected: GraphReference | null;
  dirty: boolean;
  applying: boolean;
  error: string;
  onApply: (proposal: Proposal, base: SavedAgent) => void;
  onFocus: (ref: GraphReference) => void;
  onTest: () => void;
  onPreview?: (proposal: Proposal, reference?: GraphReference) => void;
  onOpenCall?: (callId: string, turn: number) => void;
}) {
  const readCalls = readCallTurns(copilot.messages);
  // `call:` links are trusted only for turns Copilot read in this conversation; `graph:` only for existing elements.
  const resolveLink = (href: string, label: ReactNode) => {
    const evidence = parseEvidenceHref(href);
    if (evidence?.kind === 'call')
      return onOpenCall && citationVerified(readCalls, evidence.callId, evidence.turn) ? (
        <EvidenceChip onClick={() => onOpenCall(evidence.callId, evidence.turn)}>{label}</EvidenceChip>
      ) : (
        <span title="Copilot did not read this call turn in this conversation">{label} (unverified)</span>
      );
    if (evidence?.kind === 'graph')
      return referenceExists(record.agent, evidence.reference) ? (
        <EvidenceChip onClick={() => onFocus(evidence.reference)}>{label}</EvidenceChip>
      ) : (
        <span className="text-text-muted">{label} — unavailable in current graph</span>
      );
  };
  const activity = copilotActivities(copilot.messages, copilot.busy && !copilot.stopped && !copilot.error);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="max-h-1/4 shrink-0 overflow-y-auto border-b border-ui-border px-5 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0 text-sm font-medium">
            {selected ? (
              <GraphLink record={record} reference={selected} onFocus={onFocus} />
            ) : (
              <span>Whole agent</span>
            )}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-text-muted">Saved · rev {record.revision}</span>
        </div>
        {dirty && (
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Copilot uses saved changes. Save or cancel your draft in Details before Apply.
          </p>
        )}
      </div>
      <ChatPresentation
        resolveLink={resolveLink}
        empty={copilotEmptyState(record.agent, record.guidelines, selected)}
        revealKey={copilot.reviews.length ? `${record.id}:${copilot.reviews.length}` : undefined}
        messages={copilot.messages
          .filter(message => message.role !== 'system')
          .map(message => ({
            id: message.id,
            role: message.role === 'user' ? 'user' : 'assistant',
            text: message.parts.flatMap(part => (part.type === 'text' ? [part.text] : [])).join('\n'),
          }))}
        activities={activity}
        status={
          copilot.error
            ? 'error'
            : copilot.stopped
              ? 'stopped'
              : copilot.status === 'submitted'
                ? 'pending'
                : copilot.status === 'streaming'
                  ? 'streaming'
                  : copilot.messages.length
                    ? 'complete'
                    : 'idle'
        }
        errorMessage={error || copilot.error?.message}
        onSend={text => copilot.send(text)}
        onStop={copilot.stopGeneration}
        onRetry={copilot.retry}
      >
        {copilot.reviews.map((review, index) => (
          <BehaviorReviewCard
            key={index}
            review={review}
            record={record}
            busy={copilot.busy || applying}
            onSend={text => copilot.send(text)}
            onFocus={onFocus}
          />
        ))}
        {copilot.proposals.map(item => (
          <ProposalCard
            key={item.proposal.id}
            proposal={item.proposal}
            base={copilot.bases[item.proposal.baseRevision]}
            state={copilot.state(item)}
            record={record}
            dirty={dirty}
            applying={applying}
            onApply={onApply}
            onDismiss={() => copilot.close(item.proposal.id, 'Dismissed')}
            onFocus={onFocus}
            onTest={onTest}
            onPreview={onPreview}
          />
        ))}
      </ChatPresentation>
    </div>
  );
}
