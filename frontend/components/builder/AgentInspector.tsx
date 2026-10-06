'use client';

import { useId, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { nodeSchema, type AgentConfig, type AgentEdge, type AgentNode } from '@/lib/agent/schema';
import { createTransitionOperation } from '@/lib/agent/authoring';
import { nodeDescription, stepTitle } from '@/lib/agent/graph';
import { type AgentEditor, type SaveOperations } from './use-node-edits';
import { cn } from '@/lib/utils';

function Payload({ value }: { value: unknown }) {
  return <pre className="max-w-full overflow-x-auto rounded-md bg-workspace p-3 text-xs leading-5">{JSON.stringify(value, null, 2)}</pre>;
}

function CollectedFields({ edge }: { edge: AgentEdge }) {
  if (Object.keys(edge.properties).length === 0) return null;
  return <section className="space-y-3">
    <h3 className="font-medium">Collected fields</h3>
    {Object.entries(edge.properties).map(([name, value]) => {
      const schema = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
      return <div key={name} className="space-y-1 border-b border-ui-border pb-3 last:border-0">
        <div className="flex items-center justify-between gap-3"><span className="break-all font-mono text-xs">{name}</span><span className="shrink-0 text-xs text-text-subtle">{edge.required.includes(name) ? 'Required' : 'Optional'}</span></div>
        {schema && typeof schema.type === 'string' && <p className="text-xs text-text-subtle">{schema.type}</p>}
        {schema && typeof schema.description === 'string' && <p className="text-xs leading-5 text-text-muted">{schema.description}</p>}
      </div>;
    })}
    {Object.keys(edge.properties).length > 0 && <details><summary className="cursor-pointer text-xs text-text-subtle">Field schema</summary><Payload value={{ properties: edge.properties, required: edge.required }} /></details>}
  </section>;
}

function RuntimeSettings({ agent }: { agent: AgentConfig }) {
  return <section className="space-y-4 border-t border-ui-border pt-5" aria-label="Runtime settings">
    <div className="flex items-center justify-between gap-3"><h3 className="font-medium">Voice & model</h3><span className="text-xs text-text-subtle">Agent-wide · Read only</span></div>
    <dl className="space-y-4">
      <div className="space-y-2"><dt className="text-xs text-text-muted">Voice ID</dt><dd className="break-all rounded-lg border border-ui-border px-3 py-2.5 font-mono text-xs">{agent.voice_id}</dd></div>
      <div className="space-y-2"><dt className="text-xs text-text-muted">Model</dt><dd className="break-all rounded-lg border border-ui-border px-3 py-2.5">{agent.model}</dd></div>
    </dl>
  </section>;
}

function Actions({ node }: { node: AgentNode }) {
  if (!node.pre_actions.length && !node.post_actions.length) return null;
  return <section className="space-y-4 border-t border-ui-border pt-5" aria-label="Step behavior">
    <div className="flex items-center justify-between"><h3 className="font-medium">Step behavior</h3><span className="text-xs text-text-subtle">Read only</span></div>
    {(['pre_actions', 'post_actions'] as const).filter(kind => node[kind].length).map(kind => <div key={kind} className="space-y-2">
      <h4 className="text-xs text-text-muted">{kind === 'pre_actions' ? 'On entry' : 'On completion'}</h4>
      {node[kind].map((action, index) => <div key={index} className="space-y-2 rounded-lg border border-ui-border p-3">
        <p className="text-sm">{typeof action.type === 'string' ? stepTitle(action.type) : 'Custom action'}</p>
        {typeof action.text === 'string' && <p className="whitespace-pre-wrap break-words text-xs leading-5 text-text-muted">{action.text}</p>}
        <details><summary className="cursor-pointer text-xs text-text-subtle">Action payload</summary><Payload value={action} /></details>
      </div>)}
      {kind === 'post_actions' && node.end && node.post_actions.length > 0 && <p className="text-xs leading-5 text-text-muted">These actions replace the default end-conversation action.</p>}
    </div>)}
  </section>;
}

function TransitionFields({ agent, edge, onChange, onSelect, editable, collection, onCollection }: {
  agent: AgentConfig; edge: AgentEdge; onChange: (changes: Partial<AgentEdge>) => void; onSelect: (id: string) => void; editable: boolean; collection?: { text: string; error: string }; onCollection: (text: string) => void;
}) {
  const id = useId();
  return <div className="space-y-5">
    <div className="space-y-2"><label htmlFor={`${id}-description`} className="block font-medium">Transition condition</label>
      <Textarea id={`${id}-description`} className="min-h-28 resize-y px-3 py-2.5 leading-6" readOnly={!editable} value={edge.description} onChange={event => onChange({ description: event.target.value })} placeholder="When should this transition happen?" />
    </div>
    <div className="space-y-2"><label htmlFor={`${id}-target`} className="block font-medium">Target node</label>
      <div className="flex min-w-0 items-center gap-2">
        <NativeSelect id={`${id}-target`} className="min-w-0 flex-1 [&_select]:h-10 [&_select]:text-base md:[&_select]:text-sm" value={edge.target} disabled={!editable} onChange={event => onChange({ target: event.target.value })}>
          {!agent.nodes.some(node => node.name === edge.target) && <NativeSelectOption value={edge.target}>{edge.target} (missing)</NativeSelectOption>}
          {agent.nodes.map(node => <NativeSelectOption key={node.name} value={node.name}>{stepTitle(node.name)}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="button" variant="outline" size="icon" className="size-10" aria-label={`→ ${edge.target}`} title={`Open ${stepTitle(edge.target)}`} onClick={() => onSelect(edge.target)}><ArrowRight aria-hidden="true" /></Button>
      </div>
    </div>
    <details className="border-t border-ui-border pt-4"><summary className="cursor-pointer text-xs text-text-muted">Function details</summary>
      <label className="mt-3 block space-y-2 text-xs">Function name<Input aria-label="Function name" className="font-mono text-xs" readOnly={!editable} value={edge.function} onChange={event => onChange({ function: event.target.value })} /></label>
    </details>
    {editable && <details><summary className="cursor-pointer text-xs text-text-subtle">Edit collected fields</summary><p className="my-2 text-xs text-text-muted">Edit properties as JSON Schema and required as a list of field names.</p><Textarea aria-label="Collected fields JSON" className="min-h-40 font-mono text-xs" value={collection?.text ?? JSON.stringify({ properties: edge.properties, required: edge.required }, null, 2)} onChange={event => onCollection(event.target.value)} />{collection?.error && <p role="alert" className="text-xs text-destructive">{collection.error}</p>}</details>}
    <CollectedFields edge={edge} />
  </div>;
}

export function AgentInspector({ agent: committedAgent, selectedNodeId, onSelect, selectedTransitionFunction = null, onRenameTransition, onSave, editor }: {
  editor: AgentEditor; agent: AgentConfig; selectedNodeId: string | null; onSelect: (id: string | null) => void; selectedTransitionFunction?: string | null; onRenameTransition?: (name: string) => void; onSave?: SaveOperations;
}) {
  const [section, setSection] = useState<'general' | 'transitions'>('general');
  const { node, agent } = editor;
  const incoming = agent.nodes.flatMap(source => source.edges.filter(edge => edge.target === node?.name).map(edge => ({ source: source.name, edge })));
  const [newCondition, setNewCondition] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const edge = node?.edges.find(item => item.function === selectedTransitionFunction);
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const lastField = useRef<HTMLElement | null>(null);
  const updateEdge = (index: number, changes: Partial<AgentEdge>) => { if (node) { editor.operate([{ type: 'update_edge', node: node.name, function: node.edges[index].function, changes }]); if (changes.function !== undefined && edge && !node.edges.some(item => item !== edge && item.function === changes.function)) onRenameTransition?.(changes.function); } };
  const deleteEdge = (name: string) => { if (node) { editor.operate([{ type: 'delete_edge', node: node.name, function: name }]); onSelect(node.name); } };
  const cancel = () => { editor.cancel(); if (selectedNodeId && !committedAgent.nodes.some(item => item.name === selectedNodeId)) onSelect(null); else if (selectedTransitionFunction !== null) onSelect(selectedNodeId); };
  const focusField = () => { if (lastField.current?.isConnected) lastField.current.focus({ preventScroll: true }); };


  return <form ref={form} aria-label={edge ? 'Transition settings' : node ? 'Node settings' : 'Agent settings'} className="flex min-h-full flex-col text-sm" onSubmit={event => { event.preventDefault(); if (form.current?.reportValidity()) void editor.save(); }}
    onFocusCapture={event => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) lastField.current = event.target; }}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); form.current?.requestSubmit(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (editor.pending) return; if (editor.dirty) { cancel(); focusField(); } else onSelect(edge && node ? node.name : null); }
    }}>
    {node && <><div className="px-5 pt-3">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 text-text-muted" onClick={() => onSelect(edge ? node.name : null)}><ChevronLeft aria-hidden="true" />{edge ? stepTitle(node.name) : 'Agent overview'}</Button>
        {!edge && <p className="min-w-0 break-all text-right text-xs text-text-subtle">{node.name === agent.initial_node && 'Initial step'}{node.end && (node.name === agent.initial_node ? ' · Ends call' : 'Ends call')}</p>}
      </div>
      {edge ? <div className="flex min-w-0 items-center gap-2 py-4"><span className="truncate">{stepTitle(node.name)}</span><ArrowRight className="size-4 shrink-0 text-text-subtle" /><Button type="button" variant="ghost" size="sm" className="min-w-0 truncate" onClick={() => onSelect(edge.target)}>{stepTitle(edge.target)}</Button></div> : <>
        <nav aria-label="Node details" className="mt-2 flex gap-6 border-b border-ui-border">
          {(['general', 'transitions'] as const).map(item => <Button key={item} type="button" variant="ghost" size="sm" aria-pressed={section === item} onClick={() => setSection(item)} className={cn('relative h-auto rounded-none border-0 px-0 py-3 shadow-none hover:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:h-px', section === item ? 'text-accent-text after:bg-accent' : 'text-text-muted')}>
            {item === 'general' ? 'General' : 'Connections'}
          </Button>)}
        </nav>
      </>}
    </div>
    <fieldset disabled={editor.pending} className="min-w-0 flex-1 space-y-6 p-5">
      {edge ? <TransitionFields agent={agent} edge={edge} collection={editor.collections[node.name + '\0' + edge.function]} onCollection={text => editor.collection(node.name, edge.function, text)} editable={!!onSave} onSelect={onSelect} onChange={changes => updateEdge(node.edges.indexOf(edge), changes)} /> : section === 'general' ? <>
        <section className="space-y-3">
          <h3 className="font-medium">Conversation goal</h3>
          {node.task_messages.length === 0 && !onSave && <p className="text-text-muted">No task messages.</p>}
          {(node.task_messages.length ? node.task_messages : onSave ? [{ role: 'system', content: '' }] : []).map((message, index) => <div key={index} className="space-y-2">
            {node.task_messages.length > 1 && <label htmlFor={`${id}-message-${index}`} className="block text-xs text-text-muted">Message {index + 1}{typeof message.role === 'string' && ` · ${message.role}`}</label>}
            {typeof message.content === 'string' ? <Textarea id={`${id}-message-${index}`} aria-label={`Message ${index + 1} instructions`} readOnly={!onSave} value={message.content}
              className="min-h-36 resize-y px-3 py-2.5 leading-6" placeholder="Describe what this step should accomplish…"
              onChange={event => editor.update(current => ({ ...current, task_messages: current.task_messages.length ? current.task_messages.map((item, i) => i === index ? { ...item, content: event.target.value } : item) : [{ role: 'system', content: event.target.value }] }))} /> : <Payload value={message} />}
          </div>)}
        </section>
        <details className="space-y-3 border-t border-ui-border pt-4">
          <summary className="cursor-pointer text-sm font-medium">Role instructions<span className="ml-2 text-xs font-normal text-text-muted">{node.role_message === null ? 'Inherited' : 'Custom'}</span></summary>
          <label htmlFor={`${id}-role`} className="sr-only">Role instructions</label>
          <Textarea id={`${id}-role`} readOnly={!onSave} value={node.role_message ?? agent.persona} className="min-h-28 resize-y px-3 py-2.5 leading-6" placeholder="Uses the agent instructions" onChange={event => editor.update(current => ({ ...current, role_message: event.target.value }))} />
          {node.role_message !== null && onSave ? <Button type="button" variant="ghost" size="sm" className="-ml-2 text-text-muted" onClick={() => editor.update(current => ({ ...current, role_message: null }))}>Use agent instructions</Button> : null}
        </details>
        {onSave && <section className="space-y-3 border-t border-ui-border pt-5"><label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-accent-text" checked={node.end} onChange={event => editor.update(current => ({ ...current, end: event.target.checked }))} />End conversation after this step</label></section>}
        <Actions node={node} />
        <details className="border-t border-ui-border pt-4"><summary className="cursor-pointer text-xs text-text-subtle">Native message payload</summary><Payload value={{ name: node.name, role_message: node.role_message, task_messages: node.task_messages }} /></details>
      </> : <>
        <section className="space-y-3 border-b border-ui-border pb-5"><h3 className="font-medium">Incoming ({incoming.length})</h3>{incoming.length ? incoming.map(({ source, edge }) => <Button key={JSON.stringify([source, edge.function])} type="button" variant="ghost" className="h-auto w-full justify-start whitespace-normal px-2 py-2 text-left" onClick={() => onSelect(source)}><ArrowRight className="shrink-0" /><span><span className="block">From {stepTitle(source)}</span><span className="mt-1 block text-xs font-normal text-text-muted">{edge.description || 'Set condition'}</span></span></Button>) : <p className="text-xs text-text-muted">{node.name === agent.initial_node ? 'The call starts here.' : 'Connect another step to this one.'}</p>}</section>
        <h3 className="font-medium">Outgoing ({node.edges.length})</h3>
        {onSave && <details className="border-b border-ui-border pb-4"><summary className="cursor-pointer text-sm font-medium">New transition</summary><div className="mt-4 space-y-3">
          <label className="block space-y-2 text-xs">New transition condition<Textarea aria-label="New transition condition" placeholder="e.g. The caller is a new patient." value={newCondition} onChange={event => setNewCondition(event.target.value)} /></label>
          <label className="block space-y-2 text-xs">Continue to<NativeSelect aria-label="New transition target" value={newTarget} onChange={event => setNewTarget(event.target.value)}><NativeSelectOption value="">Choose a step</NativeSelectOption>{agent.nodes.map(item => <NativeSelectOption key={item.name} value={item.name}>{stepTitle(item.name)}</NativeSelectOption>)}</NativeSelect></label>
          <Button type="button" variant="outline" disabled={!newCondition.trim() || !agent.nodes.some(item => item.name === newTarget)} onClick={() => { editor.operate([createTransitionOperation(agent, node.name, newTarget, newCondition)]); setNewCondition(''); setNewTarget(''); }}>Add transition</Button>
        </div></details>}

        {node.edges.length === 0 && <p className="text-text-muted">{node.end && !node.post_actions.length ? 'The call ends here.' : 'No next step connected.'}</p>}
        {node.edges.map((item, index) => <section key={index} aria-label={`Transition ${index + 1}`} className="border-b border-ui-border pb-6 last:border-0 last:pb-0">
          <TransitionFields agent={agent} edge={item} collection={editor.collections[node.name + '\0' + item.function]} onCollection={text => editor.collection(node.name, item.function, text)} editable={!!onSave} onSelect={onSelect} onChange={changes => updateEdge(index, changes)} />
          {onSave && <Button type="button" variant="ghost" className="mt-3" onClick={() => deleteEdge(item.function)}>Delete transition</Button>}
        </section>)}
      </>}
      {edge && onSave && <Button type="button" variant="ghost" onClick={() => deleteEdge(edge.function)}>Delete transition</Button>}
    </fieldset></>}
    {!node && <fieldset disabled={editor.pending}>
<div className="space-y-6 p-5 text-sm">
    <div><h2 className="sr-only">{agent.name}</h2><p className="mt-1 text-xs text-text-muted">{agent.nodes.length} steps</p></div>
    {onSave && <Button type="button" variant="outline" disabled={editor.dirty} onClick={() => {
      editor.operate([...agent.nodes.map(item => ({ type: 'delete_node' as const, node: item.name })), { type: 'add_node', value: nodeSchema.parse({ name: 'start', end: true, task_messages: [{ role: 'system', content: 'Say goodbye.' }] }) }, { type: 'update_agent', changes: { name: 'New clinic agent', persona: '', initial_node: 'start' } }]);
      onSelect('start');
    }}>Create new agent</Button>}
    <label className="block space-y-2">Agent name<Input aria-label="Agent name" readOnly={!onSave} value={agent.name} onChange={event => editor.operate([{ type: 'update_agent', changes: { name: event.target.value } }])} /></label>
    <label className="block space-y-2">Agent instructions<Textarea aria-label="Agent instructions" readOnly={!onSave} value={agent.persona} onChange={event => editor.operate([{ type: 'update_agent', changes: { persona: event.target.value } }])} /></label>

    <label className="block space-y-2">Initial node<NativeSelect aria-label="Initial node" disabled={!onSave} value={agent.initial_node} onChange={event => editor.operate([{ type: 'update_agent', changes: { initial_node: event.target.value } }])}>{!agent.nodes.some(item => item.name === agent.initial_node) && <NativeSelectOption value={agent.initial_node}>{agent.initial_node} (missing)</NativeSelectOption>}{agent.nodes.map(item => <NativeSelectOption key={item.name} value={item.name}>{stepTitle(item.name)}</NativeSelectOption>)}</NativeSelect></label>
    <section><h3 className="mb-3 font-medium">Conversation steps</h3><div className="space-y-1">{agent.nodes.map(item => <Button key={item.name} type="button" variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-3 text-left" onClick={() => onSelect(item.name)}>
      <MessageCircle className="shrink-0 text-text-subtle" /><span className="min-w-0"><span className="block truncate">{stepTitle(item.name)}</span><span className="mt-1 line-clamp-2 whitespace-normal text-xs font-normal leading-5 text-text-muted">{nodeDescription(item)}</span></span><ArrowRight className="ml-auto shrink-0 text-text-subtle" />
    </Button>)}</div></section>
    <RuntimeSettings agent={agent} />
  </div>
    </fieldset>}
    {onSave && <div className="sticky bottom-0 z-10 space-y-2 border-t border-ui-border bg-surface-raised px-5 py-3">
      {editor.invalidCollection && <p role="alert" className="text-xs text-destructive">Fix collected fields JSON before saving.</p>}
      {editor.error && <p role="alert" className="break-words text-xs leading-5 text-destructive">{editor.error}</p>}
      <div className="flex items-center justify-between gap-2">
        <p role="status" className={cn("flex items-center gap-1.5 text-xs", editor.saved && !editor.dirty ? "text-accent-text" : "text-text-subtle", !editor.pending && !editor.dirty && !editor.saved && "sr-only")}>{editor.saved && !editor.dirty && <Check aria-hidden="true" className="size-3.5" />}{editor.pending ? 'Validating changes…' : editor.dirty ? 'Unsaved changes' : editor.saved ? 'Changes saved' : 'No changes'}</p>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="transition-colors" disabled={!editor.dirty || editor.pending} onClick={() => { cancel(); focusField(); }}>Cancel</Button>
          <Button type="submit" size="sm" className="min-w-16 bg-accent-text text-white hover:bg-accent-text/90 transition-[background-color,scale] duration-150 ease-snappy active:not-focus-visible:scale-[0.98] motion-reduce:transition-none" disabled={!editor.dirty || editor.pending || editor.invalidCollection}>Save</Button>
        </div>
      </div>
    </div>}
  </form>;
}
