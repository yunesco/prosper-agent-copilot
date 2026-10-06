'use client';

import { useState, type ReactNode } from 'react';
import { ArrowRight, Bot, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { stepTitle } from '@/lib/agent/graph';
import type { AgentConfig } from '@/lib/agent/schema';
import type { AgentEditor } from './use-node-edits';

/** Agent-level details: name, client guidelines, supplied sections, and secondary settings. */
export function AgentOverview({
  editor,
  agent,
  editable,
  onSelect,
  children,
}: {
  editor: AgentEditor;
  agent: AgentConfig;
  editable: boolean;
  onSelect: (id: string | null) => void;
  children?: ReactNode;
}) {
  const [editingGuidelines, setEditingGuidelines] = useState(false);
  return (
    <fieldset disabled={editor.pending} className="min-w-0 flex-1">
      <div className="space-y-6 p-5 text-sm">
        <div className="flex items-center gap-3">
          <Bot aria-hidden="true" className="size-5 shrink-0 text-text-muted" />
          <h2 className="text-base font-semibold">Agent overview</h2>
        </div>
        <label className="block space-y-2 font-medium">
          Agent name
          <Input
            aria-label="Agent name"
            className="font-normal"
            readOnly={!editable}
            value={agent.name}
            onChange={event =>
              editor.operate([{ type: 'update_agent', changes: { name: event.target.value } }])
            }
          />
        </label>
        <section className="space-y-3 rounded-xl bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-medium">
              <FileText aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
              Client guidelines
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Edit guidelines"
              aria-expanded={editingGuidelines}
              onClick={() => setEditingGuidelines(value => !value)}
            >
              {editingGuidelines ? 'Close editor' : 'Edit'}
            </Button>
          </div>
          {editingGuidelines ? (
            <Textarea
              aria-label="Client guidelines"
              value={editor.guidelines}
              onChange={event => editor.editGuidelines(event.target.value)}
              className="min-h-48 resize-y bg-background px-3 py-3 leading-6"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-6 text-text-muted">
              {editor.guidelines || 'Add guidelines to describe how this agent should behave.'}
            </p>
          )}
        </section>
        {children}
        <details className="border-t border-ui-border pt-3">
          <summary className="cursor-pointer rounded py-2 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            Additional details
          </summary>
          <div className="mt-3 space-y-5">
            <label className="block space-y-2">
              Agent instructions
              <Textarea
                aria-label="Agent instructions"
                readOnly={!editable}
                value={agent.persona}
                onChange={event =>
                  editor.operate([{ type: 'update_agent', changes: { persona: event.target.value } }])
                }
              />
            </label>

            <label className="block space-y-2">
              Start step
              <Select
                disabled={!editable || editor.pending}
                value={agent.initial_node}
                onValueChange={value => {
                  if (value) editor.operate([{ type: 'update_agent', changes: { initial_node: value } }]);
                }}
              >
                <SelectTrigger aria-label="Start step">
                  <SelectValue>
                    {agent.nodes.some(item => item.name === agent.initial_node)
                      ? stepTitle(agent.initial_node)
                      : `${agent.initial_node} (missing)`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {!agent.nodes.some(item => item.name === agent.initial_node) && (
                    <SelectItem value={agent.initial_node}>{agent.initial_node} (missing)</SelectItem>
                  )}
                  {agent.nodes.map(item => (
                    <SelectItem key={item.name} value={item.name}>
                      {stepTitle(item.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <section>
              <h3 className="mb-2 font-medium">Steps</h3>
              <div className="space-y-1">
                {agent.nodes.map(item => (
                  <Button
                    key={item.name}
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start gap-3 px-2 py-2 text-left"
                    onClick={() => onSelect(item.name)}
                  >
                    <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                      {stepTitle(item.name)}
                    </span>
                    <ArrowRight className="ml-auto shrink-0 text-text-subtle" />
                  </Button>
                ))}
              </div>
            </section>
          </div>
        </details>
      </div>
    </fieldset>
  );
}
