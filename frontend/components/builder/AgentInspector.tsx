'use client';

import { useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ChevronLeft, GitBranch, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { type AgentConfig, type AgentEdge } from '@/lib/agent/schema';
import { stepTitle } from '@/lib/agent/graph';
import { cn } from '@/lib/utils';
import { AgentOverview } from './AgentOverview';
import { SaveFooter } from './SaveFooter';
import { StepConnections } from './StepConnections';
import { StepGeneral } from './StepGeneral';
import { TransitionFields } from './TransitionFields';
import { type AgentEditor, type SaveOperations } from './use-node-edits';

export function AgentInspector({
  agent: committedAgent,
  selectedNodeId,
  onSelect,
  selectedTransitionFunction = null,
  onRenameTransition,
  onSave,
  editor,
  agentSections,
}: {
  agentSections?: ReactNode;
  editor: AgentEditor;
  agent: AgentConfig;
  selectedNodeId: string | null;
  onSelect: (id: string | null) => void;
  selectedTransitionFunction?: string | null;
  onRenameTransition?: (name: string) => void;
  onSave?: SaveOperations;
}) {
  const [section, setSection] = useState<'general' | 'transitions'>('general');
  const { node, agent } = editor;
  const edge = node?.edges.find(item => item.function === selectedTransitionFunction);
  const form = useRef<HTMLFormElement>(null);
  const lastField = useRef<HTMLElement | null>(null);
  const updateEdge = (index: number, changes: Partial<AgentEdge>) => {
    if (node) {
      editor.operate([
        { type: 'update_edge', node: node.name, function: node.edges[index].function, changes },
      ]);
      if (
        changes.function !== undefined &&
        edge &&
        !node.edges.some(item => item !== edge && item.function === changes.function)
      )
        onRenameTransition?.(changes.function);
    }
  };
  const deleteEdge = (name: string) => {
    if (node) {
      editor.operate([{ type: 'delete_edge', node: node.name, function: name }]);
      onSelect(node.name);
    }
  };
  const cancel = () => {
    editor.cancel();
    if (selectedNodeId && !committedAgent.nodes.some(item => item.name === selectedNodeId)) onSelect(null);
    else if (selectedTransitionFunction !== null) onSelect(selectedNodeId);
  };
  const focusField = () => {
    if (lastField.current?.isConnected) lastField.current.focus({ preventScroll: true });
  };

  return (
    <form
      ref={form}
      aria-label={edge ? 'Transition settings' : node ? 'Node settings' : 'Agent settings'}
      className="flex min-h-full min-w-0 flex-col text-sm [overflow-wrap:anywhere]"
      onSubmit={event => {
        event.preventDefault();
        if (form.current?.reportValidity()) void editor.save();
      }}
      onFocusCapture={event => {
        if (
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement ||
          (event.target instanceof HTMLElement && event.target.getAttribute('role') === 'combobox')
        )
          lastField.current = event.target;
      }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.defaultPrevented) return;
        // Portaled menus own Escape; closing a menu must not cancel the draft.
        if (event.target instanceof Element && event.target.closest('[data-slot=select-content]')) return;
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          form.current?.requestSubmit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (editor.pending) return;
          if (editor.dirty) {
            cancel();
            focusField();
          } else onSelect(edge && node ? node.name : null);
        }
      }}
    >
      {node && (
        <>
          <div className="px-5 pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 mb-4 max-w-full justify-start whitespace-normal text-left text-text-muted"
              onClick={() => onSelect(edge ? node.name : null)}
            >
              <ChevronLeft aria-hidden="true" />
              {edge ? stepTitle(node.name) : 'Agent overview'}
            </Button>
            <div className="flex items-start gap-3">
              {edge ? (
                <GitBranch aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-muted" />
              ) : (
                <MessageSquare aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-muted" />
              )}
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-6">
                  {edge ? 'Transition' : stepTitle(node.name)}
                </h2>
                {!edge && (node.name === agent.initial_node || node.end) && (
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    {node.name === agent.initial_node && 'Initial step'}
                    {node.end && (node.name === agent.initial_node ? ' · Ends call' : 'Ends call')}
                  </p>
                )}
              </div>
            </div>
            {edge ? (
              <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-ui-border pb-4 text-xs text-text-muted">
                <span>{stepTitle(node.name)}</span>
                <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto min-w-0 max-w-full whitespace-normal px-0 text-left text-xs"
                  onClick={() => onSelect(edge.target)}
                >
                  {stepTitle(edge.target)}
                </Button>
              </div>
            ) : (
              <nav aria-label="Node details" className="mt-5 flex gap-6 border-b border-ui-border">
                {(['general', 'transitions'] as const).map(item => (
                  <Button
                    key={item}
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-pressed={section === item}
                    onClick={() => setSection(item)}
                    className={cn(
                      'relative h-auto rounded-none border-0 px-0 pb-3 pt-1 shadow-none hover:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:h-px',
                      section === item ? 'text-foreground after:bg-foreground' : 'text-text-muted',
                    )}
                  >
                    {item === 'general' ? 'General' : 'Connections'}
                  </Button>
                ))}
              </nav>
            )}
          </div>
          <fieldset disabled={editor.pending} className="min-w-0 flex-1 space-y-6 px-5 py-6">
            {edge ? (
              <TransitionFields
                editor={editor}
                source={node.name}
                agent={agent}
                edge={edge}
                collection={editor.collections[node.name + '\0' + edge.function]}
                onCollection={text => editor.collection(node.name, edge.function, text)}
                editable={!!onSave}
                onSelect={onSelect}
                onChange={changes => updateEdge(node.edges.indexOf(edge), changes)}
              />
            ) : section === 'general' ? (
              <StepGeneral editor={editor} node={node} agent={agent} editable={!!onSave} />
            ) : (
              <StepConnections
                editor={editor}
                node={node}
                agent={agent}
                editable={!!onSave}
                onSelect={onSelect}
                onUpdateEdge={updateEdge}
                onDeleteEdge={deleteEdge}
              />
            )}
            {edge && onSave && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteEdge(edge.function)}
              >
                Delete transition
              </Button>
            )}
          </fieldset>
        </>
      )}
      {!node && (
        <AgentOverview editor={editor} agent={agent} editable={!!onSave} onSelect={onSelect}>
          {agentSections}
        </AgentOverview>
      )}

      {onSave && (
        <SaveFooter
          editor={editor}
          onCancel={() => {
            cancel();
            focusField();
          }}
        />
      )}
    </form>
  );
}
