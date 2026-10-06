'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createTransitionOperation } from '@/lib/agent/authoring';
import { stepTitle } from '@/lib/agent/graph';
import type { AgentConfig, AgentEdge, AgentNode } from '@/lib/agent/schema';
import { TransitionFields } from './TransitionFields';
import type { AgentEditor } from './use-node-edits';

/** A step's incoming and outgoing transitions, with a form to add one. */
export function StepConnections({
  editor,
  node,
  agent,
  editable,
  onSelect,
  onUpdateEdge,
  onDeleteEdge,
}: {
  editor: AgentEditor;
  node: AgentNode;
  agent: AgentConfig;
  editable: boolean;
  onSelect: (id: string | null) => void;
  onUpdateEdge: (index: number, changes: Partial<AgentEdge>) => void;
  onDeleteEdge: (name: string) => void;
}) {
  const [newCondition, setNewCondition] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const incoming = agent.nodes.flatMap(source =>
    source.edges.filter(edge => edge.target === node.name).map(edge => ({ source: source.name, edge })),
  );
  return (
    <>
      <section className="space-y-3 border-b border-ui-border pb-5">
        <h3 className="font-medium">Incoming ({incoming.length})</h3>
        {incoming.length ? (
          incoming.map(({ source, edge }) => (
            <Button
              key={JSON.stringify([source, edge.function])}
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start whitespace-normal px-0 py-2 text-left"
              onClick={() => onSelect(source)}
            >
              <ArrowRight className="shrink-0" />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="block">From {stepTitle(source)}</span>
                <span className="mt-1 block text-xs font-normal text-text-muted">
                  {edge.description || 'Set condition'}
                </span>
              </span>
            </Button>
          ))
        ) : (
          <p className="text-xs text-text-muted">
            {node.name === agent.initial_node ? 'The call starts here.' : 'Connect another step to this one.'}
          </p>
        )}
      </section>
      <h3 className="font-medium">Outgoing ({node.edges.length})</h3>
      {editable && (
        <details className="border-b border-ui-border pb-4">
          <summary className="cursor-pointer rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-sm font-medium">
            New transition
          </summary>
          <div className="mt-4 space-y-3">
            <label className="block space-y-2 text-xs">
              New transition condition
              <Textarea
                aria-label="New transition condition"
                placeholder="e.g. The caller is a new patient."
                value={newCondition}
                onChange={event => setNewCondition(event.target.value)}
              />
            </label>
            <label className="block space-y-2 text-xs">
              Continue to
              <Select
                value={newTarget || null}
                disabled={editor.pending}
                onValueChange={value => setNewTarget(value ?? '')}
              >
                <SelectTrigger aria-label="New transition target">
                  <SelectValue placeholder="Choose a step">
                    {newTarget ? stepTitle(newTarget) : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {agent.nodes.map(item => (
                    <SelectItem key={item.name} value={item.name}>
                      {stepTitle(item.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={!newCondition.trim() || !agent.nodes.some(item => item.name === newTarget)}
              onClick={() => {
                editor.operate([createTransitionOperation(agent, node.name, newTarget, newCondition)]);
                setNewCondition('');
                setNewTarget('');
              }}
            >
              Add transition
            </Button>
          </div>
        </details>
      )}

      {node.edges.length === 0 && (
        <p className="text-text-muted">
          {node.end && !node.post_actions.length ? 'The call ends here.' : 'No next step connected.'}
        </p>
      )}
      {node.edges.map((item, index) => (
        <section
          key={index}
          aria-label={`Transition ${index + 1}`}
          className="border-b border-ui-border pb-6 last:border-0 last:pb-0"
        >
          <TransitionFields
            editor={editor}
            source={node.name}
            agent={agent}
            edge={item}
            collection={editor.collections[node.name + '\0' + item.function]}
            onCollection={text => editor.collection(node.name, item.function, text)}
            editable={!!editable}
            onSelect={onSelect}
            onChange={changes => onUpdateEdge(index, changes)}
          />
          {editable && (
            <Button
              type="button"
              variant="ghost"
              className="mt-4 text-destructive hover:text-destructive"
              onClick={() => onDeleteEdge(item.function)}
            >
              Delete transition
            </Button>
          )}
        </section>
      ))}
    </>
  );
}
