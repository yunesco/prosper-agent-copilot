'use client';

import { useRef, useState } from 'react';
import { edgeSchema, type AgentConfig, type AgentNode } from '@/lib/agent/schema';
import { stageAgentOperations, type AgentOperation } from '@/lib/agent/operations';

export type SaveOperations = (operations: AgentOperation[]) => Promise<void>;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

// One transaction spans every step. The base object also detects revision changes
// whose content happens to be identical; BuilderShell checks again after validation.
export function useNodeEdits(agent: AgentConfig, selectedNodeId: string | null, onSave?: SaveOperations) {
  const [draft, setDraft] = useState<{ base: AgentConfig; value: AgentConfig; operations: AgentOperation[] } | null>(null);
  const [collections, setCollections] = useState<Record<string, { text: string; error: string }>>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const value = draft?.value ?? agent;
  const node = value.nodes.find(node => node.name === selectedNodeId);
  const dirty = !!draft && !same(draft.value, agent);
  const operate = (operations: AgentOperation[]) => {
    if (inFlight.current || !onSave) return;
    try {
      const next = stageAgentOperations(value, operations);
      setDraft({ base: draft?.base ?? agent, value: next, operations: [...(draft?.operations ?? []), ...operations] });
      setCollections(current => {
        const next = { ...current };
        for (const operation of operations) {
          if (operation.type === 'delete_node') for (const key of Object.keys(next)) { if (key.startsWith(operation.node + '\0')) delete next[key]; }
          if (operation.type === 'delete_edge') delete next[operation.node + '\0' + operation.function];
          if (operation.type === 'update_edge' && operation.changes.function !== undefined) {
            const key = operation.node + '\0' + operation.function;
            if (next[key]) { const value = next[key]; delete next[key]; next[operation.node + '\0' + operation.changes.function] = value; }
          }
        }
        return next;
      });
      setSaved(false); setError('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Invalid edit.'); }
  };
  const collection = (node: string, name: string, text: string) => {
    if (inFlight.current) return;
    const key = node + '\0' + name;
    try {
      const changes = edgeSchema.pick({ properties: true, required: true }).parse(JSON.parse(text));
      operate([{ type: 'update_edge', node, function: name, changes }]);
      setCollections(current => ({ ...current, [key]: { text, error: '' } }));
    } catch { setCollections(current => ({ ...current, [key]: { text, error: 'Enter valid properties and required JSON.' } })); }
  };
  const invalidCollection = Object.values(collections).some(value => value.error);
  const update = (updater: (node: AgentNode) => AgentNode) => {
    if (!node) return;
    const next = updater(node);
    const changes: Extract<AgentOperation, { type: 'update_node' }>['changes'] = {};
    if (!same(node.task_messages, next.task_messages)) changes.task_messages = next.task_messages;
    if (node.role_message !== next.role_message) changes.role_message = next.role_message;
    if (node.end !== next.end) changes.end = next.end;
    if (Object.keys(changes).length) operate([{ type: 'update_node', node: node.name, changes }]);
  };
  const cancel = () => { if (!inFlight.current) { setDraft(null); setCollections({}); setError(''); setSaved(false); } };
  const save = async () => {
    if (!onSave || !draft || !dirty || invalidCollection || inFlight.current) return;
    if (draft.base !== agent) { setError('This step changed since you started editing. Cancel to load the latest agent.'); return; }
    inFlight.current = true; setPending(true); setError('');
    try { await onSave(draft.operations); setDraft(null); setCollections({}); setSaved(true); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save changes. Try again.'); }
    finally { inFlight.current = false; setPending(false); }
  };
  return { agent: value, node, collections, collection, invalidCollection, dirty: dirty || invalidCollection, pending, saved, error, update, operate, cancel, save };
}

export type AgentEditor = ReturnType<typeof useNodeEdits>;
