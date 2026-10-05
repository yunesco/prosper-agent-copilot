'use client';

import { useRef, useState } from 'react';
import type { AgentConfig, AgentNode } from '@/lib/agent/schema';
import type { AgentOperation } from '@/lib/agent/operations';

export type SaveOperations = (operations: AgentOperation[]) => Promise<void>;
type Draft = { base: AgentNode; value: AgentNode };
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

// Drafts follow the step across pane/selection changes, outside the runtime agent.
export function useNodeEdits(agent: AgentConfig, selectedNodeId: string | null, onSave?: SaveOperations) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const inFlight = useRef(false);
  const committed = agent.nodes.find(node => node.name === selectedNodeId);
  const draft = committed ? drafts[committed.name] : undefined;
  const node = draft?.value ?? committed;
  const dirty = !!draft && !same(draft.value, committed);

  const update = (updater: (node: AgentNode) => AgentNode) => {
    if (!committed || inFlight.current || !onSave) return;
    const name = committed.name;
    setSaved(null);
    setErrors(current => ({ ...current, [name]: '' }));
    setDrafts(current => {
      const base = current[name]?.base ?? committed;
      return { ...current, [name]: { base, value: updater(current[name]?.value ?? committed) } };
    });
  };
  const cancel = () => {
    if (!committed || inFlight.current) return;
    setDrafts(current => { const next = { ...current }; delete next[committed.name]; return next; });
    setErrors(current => ({ ...current, [committed.name]: '' }));
    setSaved(null);
  };
  const save = async () => {
    if (!onSave || !committed || !draft || !dirty || inFlight.current) return;
    const name = committed.name;
    if (!same(draft.base, committed)) {
      setErrors(current => ({ ...current, [name]: 'This step changed since you started editing. Cancel to load the latest version.' }));
      return;
    }
    const operations: AgentOperation[] = [];
    if (!same(draft.value.task_messages, committed.task_messages) || draft.value.role_message !== committed.role_message) {
      operations.push({ type: 'update_node', node: name, changes: { task_messages: draft.value.task_messages, role_message: draft.value.role_message } });
    }
    draft.value.edges.forEach((edge, index) => {
      if (!same(edge, committed.edges[index])) operations.push({ type: 'update_edge', node: name, edge_index: index, changes: { description: edge.description, target: edge.target } });
    });
    inFlight.current = true;
    setSaving(name); setErrors(current => ({ ...current, [name]: '' }));
    try {
      await onSave(operations);
      setDrafts(current => { const next = { ...current }; delete next[name]; return next; });
      setSaved(name);
    } catch (error) {
      setErrors(current => ({ ...current, [name]: error instanceof Error ? error.message : 'Could not save changes. Try again.' }));
    } finally { inFlight.current = false; setSaving(null); }
  };
  return { node, dirty, pending: saving !== null, saved: saved === selectedNodeId, error: selectedNodeId ? errors[selectedNodeId] : undefined, update, cancel, save };
}
