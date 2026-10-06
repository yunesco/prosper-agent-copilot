'use client';

import { ArrowLeft, ArrowRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { focusRing } from '@/components/ui/focus';
import { stepTitle } from '@/lib/agent/graph';
import type { GraphReference, Proposal } from '@/lib/agent/proposals';

/** Read-only candidate presentation. No editor or repository is reachable here. */
export function ProposalInspector({
  proposal,
  selected,
  onSelect,
  onReview,
}: {
  proposal: Proposal;
  selected: GraphReference | null;
  onSelect: (reference: GraphReference | null) => void;
  onReview: () => void;
}) {
  const agent = proposal.candidate;
  const node = agent.nodes.find(item => item.name === selected?.node);
  const edge =
    selected?.kind === 'transition'
      ? node?.edges.find(item => item.function === selected.function)
      : undefined;
  const title = edge ? 'Proposed transition' : node ? stepTitle(node.name) : agent.name;
  return (
    <section aria-label="Proposed details" className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 text-sm [overflow-wrap:anywhere]">
        {selected && (
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => onSelect(null)}>
            <ArrowLeft aria-hidden="true" />
            Proposed agent
          </Button>
        )}
        <header className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium text-proposal">
            <Eye aria-hidden="true" className="size-4" />
            Proposal preview · Not saved
          </p>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs leading-5 text-text-muted">
            Inspect the candidate here. Apply in Copilot saves the reviewed changes.
          </p>
        </header>
        {edge ? (
          <>
            <div>
              <h3 className="font-medium">Condition</h3>
              <p className="mt-2 whitespace-pre-wrap leading-6">{edge.description}</p>
            </div>
            <div>
              <h3 className="font-medium">Next step</h3>
              <Button
                variant="link"
                className="h-auto max-w-full whitespace-normal px-0 text-left"
                onClick={() => onSelect({ kind: 'node', node: edge.target })}
              >
                {stepTitle(edge.target)}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
            <div className="space-y-3">
              <h3 className="font-medium">Information to collect</h3>
              {Object.entries(edge.properties).length ? (
                Object.entries(edge.properties).map(([name, schema]) => (
                  <div key={name} className="border-t border-ui-border pt-3">
                    <p className="font-medium">
                      {stepTitle(name)}
                      {edge.required.includes(name) && (
                        <span className="ml-2 text-xs font-normal text-text-muted">Required</span>
                      )}
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap text-xs leading-5 text-text-muted">
                      {JSON.stringify(schema, null, 2)}
                    </pre>
                  </div>
                ))
              ) : (
                <p className="text-text-muted">No information collected on this transition.</p>
              )}
            </div>
          </>
        ) : node ? (
          <>
            <p className="text-xs text-text-muted">
              {node.name === agent.initial_node ? 'Start step · ' : ''}
              {node.end ? 'End conversation' : 'Conversation step'}
            </p>
            <div className="space-y-3">
              <h3 className="font-medium">Instructions</h3>
              {node.task_messages.map((message, index) => (
                <div key={index} className="space-y-1">
                  <p className="text-xs text-text-muted">
                    {typeof message.role === 'string' ? message.role : 'Message'}
                  </p>
                  <p className="whitespace-pre-wrap leading-6">
                    {typeof message.content === 'string'
                      ? message.content
                      : JSON.stringify(message.content, null, 2)}
                  </p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">Transitions</h3>
              {node.edges.length ? (
                node.edges.map(transition => (
                  <Button
                    key={transition.function}
                    variant="outline"
                    className="h-auto w-full justify-between gap-3 whitespace-normal py-3 text-left font-normal"
                    onClick={() =>
                      onSelect({ kind: 'transition', node: node.name, function: transition.function })
                    }
                  >
                    <span className="min-w-0">
                      <span className="block">{transition.description}</span>
                      <span className="mt-1 block text-xs text-text-muted">
                        To {stepTitle(transition.target)}
                      </span>
                    </span>
                    <ArrowRight aria-hidden="true" className="shrink-0" />
                  </Button>
                ))
              ) : (
                <p className="text-text-muted">No outgoing transitions.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <h3 className="font-medium">Agent instructions</h3>
              <p className="mt-2 whitespace-pre-wrap leading-6">{agent.persona}</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">Steps ({agent.nodes.length})</h3>
              {agent.nodes.map(item => (
                <Button
                  key={item.name}
                  variant="ghost"
                  className="h-auto w-full justify-between whitespace-normal py-2 text-left"
                  onClick={() => onSelect({ kind: 'node', node: item.name })}
                >
                  {stepTitle(item.name)}
                  <ArrowRight aria-hidden="true" />
                </Button>
              ))}
            </div>
          </>
        )}
        <details className="border-t border-ui-border pt-3">
          <summary className={`cursor-pointer py-2 text-xs font-medium ${focusRing}`}>
            Full candidate configuration
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs leading-5">
            {JSON.stringify(edge ?? node ?? agent, null, 2)}
          </pre>
        </details>
      </div>
      <footer className="shrink-0 border-t border-ui-border p-4">
        <Button variant="outline" className="w-full" onClick={onReview}>
          Review proposal in Copilot
          <ArrowRight aria-hidden="true" />
        </Button>
      </footer>
    </section>
  );
}
