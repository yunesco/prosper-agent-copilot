'use client';

import { useEffect, useRef, useState } from 'react';
import type { SavedAgent } from '@/lib/agent/repository';
import { reconnectStepOperations } from '@/lib/agent/authoring';
import { editCollectedField, type FieldDraft } from '@/lib/agent/collected-fields';
import { edgeSchema, type AgentConfig, type AgentNode } from '@/lib/agent/schema';
import { stageAgentOperations, type AgentOperation } from '@/lib/agent/operations';

export type SaveOperations = (operations: AgentOperation[], guidelines?: string, assertActive?: () => void) => Promise<void>;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

// One transaction spans every step. The base object also detects revision changes
// whose content happens to be identical; BuilderShell checks again after validation.
export function useNodeEdits(agent: AgentConfig, selectedNodeId: string | null, onSave?: SaveOperations, savedRecord?: SavedAgent) {
  const [guidelineDraft, setGuidelineDraft] = useState<{ base: SavedAgent | undefined; value: string } | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  const guidelines = guidelineDraft?.value ?? savedRecord?.guidelines ?? '';
  const [draft, setDraft] = useState<{ base: AgentConfig; savedBase?: SavedAgent; value: AgentConfig; operations: AgentOperation[] } | null>(null);
  const [fieldEdits, setFieldEdits] = useState<Record<string, FieldDraft>>({});
  const [collections, setCollections] = useState<Record<string, { text: string; error: string }>>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const value = draft?.value ?? agent;
  const node = value.nodes.find(node => node.name === selectedNodeId);
  const dirty = (!!draft && !same(draft.value, agent)) || guidelines !== (savedRecord?.guidelines ?? '');
  const operate = (operations: AgentOperation[]) => {
    if (inFlight.current || !onSave) return;
    try {
      const next = stageAgentOperations(value, operations);
      setDraft({ base: draft?.base ?? agent, savedBase: draft?.savedBase ?? savedRecord, value: next, operations: [...(draft?.operations ?? []), ...operations] });
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
      setFieldEdits(current => {
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
  const fieldEdit = (node: string, name: string, edit: FieldDraft | null) => {
    if (inFlight.current) return;
    setFieldEdits(current => { const next = { ...current }; const key = node + '\0' + name; if (edit) next[key] = edit; else delete next[key]; return next; });
  };
  const finishField = (node: string, name: string) => {
    const key = node + '\0' + name;
    const edit = fieldEdits[key];
    const edge = value.nodes.find(item => item.name === node)?.edges.find(item => item.function === name);
    if (!edit || !edge || inFlight.current) return;
    try { collection(node, name, JSON.stringify(editCollectedField(edge, edit), null, 2)); fieldEdit(node, name, null); }
    catch (error) { fieldEdit(node, name, { ...edit, error: error instanceof Error ? error.message : 'Invalid field.' }); }
  };
  const reconnect = (source: string, name: string, nextSource: string, target: string) => {
    if (inFlight.current || !onSave) return false;
    try {
      const operations = reconnectStepOperations(value, source, name, nextSource, target);
      operate(operations);
      if (source !== nextSource) {
        const oldKey = source + '\0' + name;
        const nextKey = nextSource + '\0' + name;
        if (fieldEdits[oldKey]) setFieldEdits(current => ({ ...current, [nextKey]: fieldEdits[oldKey] }));
        if (collections[oldKey]) setCollections(current => ({ ...current, [nextKey]: collections[oldKey] }));
      }
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not move the connection.'); return false; }
  };
  const unfinishedField = Object.keys(fieldEdits).length > 0;
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
  const cancel = () => {
    generation.current += 1; inFlight.current = false; setPending(false);
    setDraft(null); setGuidelineDraft(null); setCollections({}); setFieldEdits({}); setError(''); setSaved(false);
  };
  const save = async (): Promise<boolean> => {
    if (!onSave || invalidCollection || unfinishedField || inFlight.current) return false;
    if (!dirty) return true;
    if ((draft && (draft.base !== agent || draft.savedBase !== savedRecord)) || (guidelineDraft && guidelineDraft.base !== savedRecord)) {
      setError('This step changed since you started editing. Cancel to load the latest agent.'); return false;
    }
    const token = ++generation.current;
    const assertActive = () => { if (generation.current !== token) throw new Error('Edits were canceled or the active agent changed.'); };
    inFlight.current = true; setPending(true); setError('');
    try {
      await onSave(draft?.operations ?? [], guidelines, assertActive);
      assertActive(); setDraft(null); setGuidelineDraft(null); setCollections({}); setFieldEdits({}); setSaved(true); return true;
    } catch (error) {
      if (generation.current === token) setError(error instanceof Error ? error.message : 'Could not save changes. Try again.');
      return false;
    } finally { if (generation.current === token) { inFlight.current = false; setPending(false); } }
  };
  const editGuidelines = (text: string) => {
    if (inFlight.current) return;
    setGuidelineDraft({ base: guidelineDraft?.base ?? savedRecord, value: text }); setSaved(false); setError('');
  };
  return { guidelines, editGuidelines, agent: value, node, reconnect, fieldEdits, fieldEdit, finishField, unfinishedField, collections, collection, invalidCollection, dirty: dirty || invalidCollection || unfinishedField, pending, saved, error, update, operate, cancel, save };
}

export type AgentEditor = ReturnType<typeof useNodeEdits>;
