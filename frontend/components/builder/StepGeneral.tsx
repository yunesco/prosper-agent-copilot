'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import type { AgentConfig, AgentNode } from '@/lib/agent/schema';
import { Actions, Payload } from './StepPayloads';
import type { AgentEditor } from './use-node-edits';

/** A step's conversation goal, role instructions and end flag. Read-only when `editable` is false. */
export function StepGeneral({
  editor,
  node,
  agent,
  editable,
}: {
  editor: AgentEditor;
  node: AgentNode;
  agent: AgentConfig;
  editable: boolean;
}) {
  const id = useId();
  return (
    <>
      <section className="space-y-3">
        <h3 className="font-medium">Conversation goal</h3>
        {node.task_messages.length === 0 && !editable && <p className="text-text-muted">No task messages.</p>}
        {(node.task_messages.length
          ? node.task_messages
          : editable
            ? [{ role: 'system', content: '' }]
            : []
        ).map((message, index) => (
          <div key={index} className="space-y-2">
            {node.task_messages.length > 1 && (
              <label htmlFor={`${id}-message-${index}`} className="block text-xs text-text-muted">
                Message {index + 1}
                {typeof message.role === 'string' && ` · ${message.role}`}
              </label>
            )}
            {typeof message.content === 'string' ? (
              <Textarea
                id={`${id}-message-${index}`}
                aria-label={`Message ${index + 1} instructions`}
                readOnly={!editable}
                value={message.content}
                className="min-h-40 resize-y bg-surface/50 px-3 py-3 leading-6"
                placeholder="Describe what this step should accomplish…"
                onChange={event =>
                  editor.update(current => ({
                    ...current,
                    task_messages: current.task_messages.length
                      ? current.task_messages.map((item, i) =>
                          i === index ? { ...item, content: event.target.value } : item,
                        )
                      : [{ role: 'system', content: event.target.value }],
                  }))
                }
              />
            ) : (
              <Payload value={message} />
            )}
          </div>
        ))}
      </section>
      <details className="space-y-3 border-t border-ui-border pt-4">
        <summary className="cursor-pointer rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-sm font-medium">
          Role instructions
          <span className="ml-2 text-xs font-normal text-text-muted">
            {node.role_message === null ? 'Inherited' : 'Custom'}
          </span>
        </summary>
        <label htmlFor={`${id}-role`} className="sr-only">
          Role instructions
        </label>
        <Textarea
          id={`${id}-role`}
          readOnly={!editable}
          value={node.role_message ?? agent.persona}
          className="min-h-28 resize-y px-3 py-2.5 leading-6"
          placeholder="Uses the agent instructions"
          onChange={event => editor.update(current => ({ ...current, role_message: event.target.value }))}
        />
        {node.role_message !== null && editable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 text-text-muted"
            onClick={() => editor.update(current => ({ ...current, role_message: null }))}
          >
            Use agent instructions
          </Button>
        ) : null}
      </details>
      {editable && (
        <section className="space-y-3 border-t border-ui-border pt-5">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox
              disabled={editor.pending}
              checked={node.end}
              onCheckedChange={checked => editor.update(current => ({ ...current, end: checked }))}
            />
            End conversation after this step
          </label>
        </section>
      )}
      <Actions node={node} />
    </>
  );
}
