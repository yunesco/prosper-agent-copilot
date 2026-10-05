'use client';

import { useId, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, MessageCircle, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { AgentConfig, AgentEdge, AgentNode } from '@/lib/agent/schema';
import { nodeDescription, stepTitle } from '@/lib/agent/graph';
import { useNodeEdits, type SaveOperations } from './use-node-edits';
import { cn } from '@/lib/utils';

function Payload({ value }: { value: unknown }) {
  return <pre className="max-w-full overflow-x-auto rounded-md bg-workspace p-3 text-xs leading-5">{JSON.stringify(value, null, 2)}</pre>;
}

function CollectedFields({ edge }: { edge: AgentEdge }) {
  return <section className="space-y-3">
    <h3 className="font-medium">Collected fields</h3>
    {Object.keys(edge.properties).length === 0 && <p className="text-xs text-text-muted">No fields collected.</p>}
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
  return <section className="space-y-4 border-t border-ui-border pt-5" aria-label="Step behavior">
    <div className="flex items-center justify-between"><h3 className="font-medium">Step behavior</h3><span className="text-xs text-text-subtle">Read only</span></div>
    {(['pre_actions', 'post_actions'] as const).map(kind => <div key={kind} className="space-y-2">
      <h4 className="text-xs text-text-muted">{kind === 'pre_actions' ? 'On entry' : 'On completion'}</h4>
      {node[kind].length ? node[kind].map((action, index) => <div key={index} className="space-y-2 rounded-lg border border-ui-border p-3">
        <p className="text-sm">{typeof action.type === 'string' ? stepTitle(action.type) : 'Custom action'}</p>
        {typeof action.text === 'string' && <p className="whitespace-pre-wrap break-words text-xs leading-5 text-text-muted">{action.text}</p>}
        <details><summary className="cursor-pointer text-xs text-text-subtle">Action payload</summary><Payload value={action} /></details>
      </div>) : <p className="flex items-center gap-2 text-sm">{kind === 'post_actions' && node.end ? <><PhoneOff className="size-4 text-text-muted" />End conversation</> : kind === 'pre_actions' ? 'No entry actions' : 'Continue conversation'}</p>}
      {kind === 'post_actions' && node.end && node.post_actions.length > 0 && <p className="text-xs leading-5 text-text-muted">These actions replace the default end-conversation action.</p>}
    </div>)}
  </section>;
}

function TransitionFields({ agent, edge, onChange, onSelect, editable }: {
  agent: AgentConfig; edge: AgentEdge; onChange: (changes: Partial<Pick<AgentEdge, 'target' | 'description'>>) => void; onSelect: (id: string) => void; editable: boolean;
}) {
  const id = useId();
  return <div className="space-y-5">
    <div className="space-y-2"><label htmlFor={`${id}-description`} className="block font-medium">Description</label>
      <Textarea id={`${id}-description`} className="min-h-28 resize-y px-3 py-2.5 leading-6" readOnly={!editable} value={edge.description} onChange={event => onChange({ description: event.target.value })} placeholder="When should this transition happen?" />
    </div>
    <div className="space-y-2"><label htmlFor={`${id}-target`} className="block font-medium">Target node</label>
      <div className="flex min-w-0 items-center gap-2">
        <NativeSelect id={`${id}-target`} className="min-w-0 flex-1 [&_select]:h-10 [&_select]:text-base md:[&_select]:text-sm" value={edge.target} disabled={!editable} onChange={event => onChange({ target: event.target.value })}>
          {agent.nodes.map(node => <NativeSelectOption key={node.name} value={node.name}>{stepTitle(node.name)}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="button" variant="outline" size="icon" className="size-10" aria-label={`→ ${edge.target}`} title={`Open ${stepTitle(edge.target)}`} onClick={() => onSelect(edge.target)}><ArrowRight aria-hidden="true" /></Button>
      </div>
    </div>
    <div className="flex min-w-0 items-start justify-between gap-4 border-y border-ui-border py-3"><span className="shrink-0 text-xs text-text-muted">Function call</span><span className="break-all text-right font-mono text-xs">{edge.function}</span></div>
    <CollectedFields edge={edge} />
  </div>;
}

export function AgentInspector({ agent, selectedNodeId, onSelect, selectedTransitionIndex = null, onSave }: {
  agent: AgentConfig; selectedNodeId: string | null; onSelect: (id: string | null) => void; selectedTransitionIndex?: number | null; onSave?: SaveOperations;
}) {
  const [section, setSection] = useState<'general' | 'transitions'>('general');
  const editor = useNodeEdits(agent, selectedNodeId, onSave);
  const { node } = editor;
  const edge = selectedTransitionIndex !== null ? node?.edges[selectedTransitionIndex] : undefined;
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const lastField = useRef<HTMLElement | null>(null);
  const updateEdge = (index: number, changes: Partial<Pick<AgentEdge, 'target' | 'description'>>) => editor.update(current => ({ ...current, edges: current.edges.map((item, i) => i === index ? { ...item, ...changes } : item) }));
  const focusField = () => { if (lastField.current?.isConnected) lastField.current.focus({ preventScroll: true }); };

  if (!node) return <div className="space-y-6 p-5 text-sm">
    <div><h2 className="text-lg font-medium">{agent.name}</h2><p className="mt-1 text-xs text-text-muted">Original scheduler · {agent.nodes.length} steps</p></div>
    <section><h3 className="mb-2 font-medium">Agent instructions</h3><p className="whitespace-pre-wrap break-words leading-6 text-text-muted">{agent.persona || 'No persona provided.'}</p></section>
    <section><h3 className="mb-3 font-medium">Conversation steps</h3><div className="space-y-1">{agent.nodes.map(item => <Button key={item.name} type="button" variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-3 text-left" onClick={() => onSelect(item.name)}>
      <MessageCircle className="shrink-0 text-text-subtle" /><span className="min-w-0"><span className="block truncate">{stepTitle(item.name)}</span><span className="mt-1 line-clamp-2 whitespace-normal text-xs font-normal leading-5 text-text-muted">{nodeDescription(item)}</span></span><ArrowRight className="ml-auto shrink-0 text-text-subtle" />
    </Button>)}</div></section>
    <RuntimeSettings agent={agent} />
    <p className="text-xs text-text-subtle">Initial node: <span className="font-mono">{agent.initial_node}</span></p>
  </div>;

  return <form ref={form} aria-label={edge ? 'Transition settings' : 'Node settings'} className="flex min-h-full flex-col text-sm" onSubmit={event => { event.preventDefault(); void editor.save(); }}
    onFocusCapture={event => { if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) lastField.current = event.target; }}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); form.current?.requestSubmit(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (editor.pending) return; if (editor.dirty) { editor.cancel(); focusField(); } else onSelect(edge ? node.name : null); }
    }}>
    <div className="px-5 pt-3">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 text-text-muted" onClick={() => onSelect(edge ? node.name : null)}><ChevronLeft aria-hidden="true" />{edge ? stepTitle(node.name) : 'Agent overview'}</Button>
        {!edge && <p className="min-w-0 break-all text-right font-mono text-[11px] text-text-subtle">{node.name}{node.name === agent.initial_node && ' · Initial'}{node.end && ' · Terminal'}</p>}
      </div>
      {edge ? <div className="flex min-w-0 items-center gap-2 py-4"><span className="truncate">{stepTitle(node.name)}</span><ArrowRight className="size-4 shrink-0 text-text-subtle" /><Button type="button" variant="ghost" size="sm" className="min-w-0 truncate" onClick={() => onSelect(edge.target)}>{stepTitle(edge.target)}</Button></div> : <>
        <nav aria-label="Node details" className="mt-2 flex gap-6 border-b border-ui-border">
          {(['general', 'transitions'] as const).map(item => <Button key={item} type="button" variant="ghost" size="sm" aria-pressed={section === item} onClick={() => setSection(item)} className={cn('relative h-auto rounded-none border-0 px-0 py-3 shadow-none hover:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:h-px', section === item ? 'text-foreground after:bg-foreground' : 'text-text-muted')}>
            {item === 'general' ? 'General' : `Transitions (${node.edges.length})`}
          </Button>)}
        </nav>
      </>}
    </div>
    <fieldset disabled={editor.pending} className="min-w-0 flex-1 space-y-6 p-5">
      {edge && selectedTransitionIndex !== null ? <TransitionFields agent={agent} edge={edge} editable={!!onSave} onSelect={onSelect} onChange={changes => updateEdge(selectedTransitionIndex, changes)} /> : section === 'general' ? <>
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
        <section className="space-y-2 border-t border-ui-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor={`${id}-role`} className="font-medium">Role instructions</label>
            <span className="text-xs text-text-subtle">{node.role_message === null ? 'Inherited from agent' : 'Node override'}</span>
          </div>
          <Textarea id={`${id}-role`} readOnly={!onSave} value={node.role_message ?? agent.persona} className="min-h-28 resize-y px-3 py-2.5 leading-6" placeholder="Uses the agent instructions" onChange={event => editor.update(current => ({ ...current, role_message: event.target.value }))} />
          {node.role_message !== null && onSave ? <Button type="button" variant="ghost" size="sm" className="-ml-2 text-text-muted" onClick={() => editor.update(current => ({ ...current, role_message: null }))}>Use agent instructions</Button> : <p className="text-xs leading-5 text-text-subtle">{onSave ? 'Editing creates an override for this step.' : 'Applies to this step.'}</p>}
        </section>
        <RuntimeSettings agent={agent} />
        <Actions node={node} />
        <details className="border-t border-ui-border pt-4"><summary className="cursor-pointer text-xs text-text-subtle">Native message payload</summary><Payload value={{ role_message: node.role_message, task_messages: node.task_messages }} /></details>
      </> : <>
        <div><h3 className="font-medium">Outgoing transitions</h3><p className="mt-1 text-xs leading-5 text-text-muted">Choose when this step continues and where it goes.</p></div>
        {node.edges.length === 0 && <p className="text-text-muted">No outgoing transitions.</p>}
        {node.edges.map((item, index) => <section key={index} aria-label={`Transition ${index + 1}`} className="border-b border-ui-border pb-6 last:border-0 last:pb-0">
          <TransitionFields agent={agent} edge={item} editable={!!onSave} onSelect={onSelect} onChange={changes => updateEdge(index, changes)} />
        </section>)}
      </>}
    </fieldset>
    {onSave && <div className="sticky bottom-0 z-10 space-y-2 border-t border-ui-border bg-surface-raised px-5 py-3">
      {editor.error && <p role="alert" className="break-words text-xs leading-5 text-destructive">{editor.error}</p>}
      <div className="flex items-center justify-between gap-2">
        <p role="status" className="text-xs text-text-subtle">{editor.pending ? 'Validating changes…' : editor.dirty ? 'Unsaved changes' : editor.saved ? 'Changes saved' : 'No changes'}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="transition-colors" disabled={!editor.dirty || editor.pending} onClick={() => { editor.cancel(); focusField(); }}>Cancel</Button>
          <Button type="submit" size="sm" className="min-w-16 transition-colors" disabled={!editor.dirty || editor.pending}>Save</Button>
        </div>
      </div>
    </div>}
  </form>;
}
