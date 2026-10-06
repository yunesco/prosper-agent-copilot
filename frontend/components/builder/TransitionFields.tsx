'use client';

import { useId } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type AgentConfig, type AgentEdge } from '@/lib/agent/schema';
import { stepTitle } from '@/lib/agent/graph';
import { CollectedFieldsEditor } from './CollectedFieldsEditor';
import { CollectedFields } from './StepPayloads';
import { type AgentEditor } from './use-node-edits';

export function TransitionFields({
  agent,
  edge,
  onChange,
  onSelect,
  editable,
  collection,
  onCollection,
  editor,
  source,
}: {
  editor: AgentEditor;
  source: string;
  agent: AgentConfig;
  edge: AgentEdge;
  onChange: (changes: Partial<AgentEdge>) => void;
  onSelect: (id: string) => void;
  editable: boolean;
  collection?: { text: string; error: string };
  onCollection: (text: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor={`${id}-description`} className="block font-medium">
          Transition condition
        </label>
        <Textarea
          id={`${id}-description`}
          className="min-h-28 resize-y px-3 py-2.5 leading-6"
          readOnly={!editable}
          value={edge.description}
          onChange={event => onChange({ description: event.target.value })}
          placeholder="When should this transition happen?"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`${id}-target`} className="block font-medium">
          Target node
        </label>
        <div className="flex min-w-0 items-center gap-2">
          <Select
            value={edge.target}
            disabled={!editable || editor.pending}
            onValueChange={value => {
              if (value) onChange({ target: value });
            }}
          >
            <SelectTrigger id={`${id}-target`} className="min-w-0 flex-1">
              <SelectValue>
                {agent.nodes.some(node => node.name === edge.target)
                  ? stepTitle(edge.target)
                  : `${edge.target} (missing)`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {!agent.nodes.some(node => node.name === edge.target) && (
                <SelectItem value={edge.target}>{edge.target} (missing)</SelectItem>
              )}
              {agent.nodes.map(node => (
                <SelectItem key={node.name} value={node.name}>
                  {stepTitle(node.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label={`→ ${edge.target}`}
            title={`Open ${stepTitle(edge.target)}`}
            onClick={() => onSelect(edge.target)}
          >
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      {editable && (
        <CollectedFieldsEditor
          draft={editor.fieldEdits[source + '\0' + edge.function]}
          onDraft={draft => editor.fieldEdit(source, edge.function, draft)}
          onDone={() => editor.finishField(source, edge.function)}
          edge={edge}
          disabled={!!collection?.error || editor.pending}
          onChange={fields => onCollection(JSON.stringify(fields, null, 2))}
        />
      )}
      <details className="border-t border-ui-border pt-4">
        <summary className="cursor-pointer rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-xs text-text-muted">
          Function details
        </summary>
        <label className="mt-3 block space-y-2 text-xs">
          Function name
          <Input
            aria-label="Function name"
            className="font-mono text-xs"
            readOnly={!editable}
            value={edge.function}
            onChange={event => onChange({ function: event.target.value })}
          />
        </label>
      </details>
      {editable && (
        <details>
          <summary className="cursor-pointer rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-xs text-text-subtle">
            Advanced JSON
          </summary>
          <p className="my-2 text-xs text-text-muted">
            Edit properties as JSON Schema and required as a list of field names.
          </p>
          <Textarea
            disabled={!!editor.fieldEdits[source + '\0' + edge.function]}
            aria-label="Collected fields JSON"
            className="min-h-40 font-mono text-xs"
            value={
              collection?.text ??
              JSON.stringify({ properties: edge.properties, required: edge.required }, null, 2)
            }
            onChange={event => onCollection(event.target.value)}
          />
          {collection?.error && (
            <p role="alert" className="text-xs text-destructive">
              {collection.error}
            </p>
          )}
        </details>
      )}
      {!editable && <CollectedFields edge={edge} />}
    </div>
  );
}
