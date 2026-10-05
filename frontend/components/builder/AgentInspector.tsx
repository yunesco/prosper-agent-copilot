'use client';

import { useState } from 'react';
import { ArrowRight, ChevronLeft, MessageCircle, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { AgentConfig, AgentEdge } from '@/lib/agent/schema';
import { nodeDescription, stepTitle } from '@/lib/agent/graph';
import { cn } from '@/lib/utils';

function Payload({ value }: { value: unknown }) {
  return <pre className="max-w-full overflow-x-auto rounded-md bg-workspace p-3 text-xs leading-5">{JSON.stringify(value, null, 2)}</pre>;
}

function CollectedFields({ edge }: { edge: AgentEdge }) {
  const fields = Object.entries(edge.properties);
  return <div className="space-y-3">
    {fields.length === 0 && <p className="text-sm text-text-muted">No fields collected.</p>}
    {fields.map(([name, value]) => {
      const schema = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
      return <div key={name} className="border-b border-ui-border pb-3">
        <div className="flex items-center justify-between gap-2"><span className="break-all font-mono text-xs">{name}</span><span className="text-xs text-text-subtle">{edge.required.includes(name) ? 'Required' : 'Optional'}</span></div>
        {schema && typeof schema.description === 'string' && <p className="mt-1 text-xs leading-5 text-text-muted">{schema.description}</p>}
      </div>;
    })}
    <details><summary className="cursor-pointer text-xs text-text-subtle">Field schema</summary><Payload value={{ properties: edge.properties, required: edge.required }} /></details>
  </div>;
}

export function AgentInspector({ agent, selectedNodeId, onSelect, selectedTransitionIndex = null }: { agent: AgentConfig; selectedNodeId: string | null; onSelect: (id: string | null) => void; selectedTransitionIndex?: number | null }) {
  const [section, setSection] = useState<'general' | 'transitions'>('general');
  const node = agent.nodes.find(item => item.name === selectedNodeId);
  const edge = selectedTransitionIndex !== null ? node?.edges[selectedTransitionIndex] : undefined;
  if (node && edge) return <div className="space-y-6 p-5 text-sm" onKeyDown={event => { if (event.key === 'Escape') onSelect(node.name); }}>
    <Button variant="ghost" size="sm" className="-ml-2 text-text-muted" onClick={() => onSelect(node.name)}><ChevronLeft />{stepTitle(node.name)}</Button>
    <div className="flex items-center gap-3"><span>{stepTitle(node.name)}</span><ArrowRight className="size-4 shrink-0" /><Button variant="ghost" size="sm" onClick={() => onSelect(edge.target)}>{stepTitle(edge.target)}</Button></div>
    <section><h3 className="mb-2 font-medium">Transition type</h3><p className="rounded-lg border border-ui-border p-3">Function call</p></section>
    <section><h3 className="mb-2 font-medium">Description</h3><p className="whitespace-pre-wrap rounded-lg border border-ui-border p-3 leading-6">{edge.description || 'No transition description.'}</p></section>
    <section><h3 className="mb-2 font-medium">Function</h3><p className="break-all rounded-lg border border-ui-border p-3 font-mono text-xs">{edge.function}</p></section>
    <section><h3 className="mb-2 font-medium">Collected fields</h3><CollectedFields edge={edge} /></section>
  </div>;
  return <div className="text-sm" onKeyDown={event => { if (event.key === 'Escape') onSelect(null); }}>
    {node ? <>
      <div className="px-5 pt-3">
        <Button variant="ghost" size="sm" className="-ml-2 text-text-muted" onClick={() => onSelect(null)}><ChevronLeft />Agent overview</Button>
        <nav aria-label="Node details" className="mt-4 flex gap-6 border-b border-ui-border">
          {(['general', 'transitions'] as const).map(item => <Button key={item} variant="ghost" size="sm" aria-pressed={section === item} onClick={() => setSection(item)} className={cn('relative h-auto rounded-none border-0 px-0 py-3 shadow-none hover:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:h-px', section === item ? 'text-foreground after:bg-foreground' : 'text-text-muted')}>
            {item === 'general' ? 'General' : `Transitions (${node.edges.length})`}
          </Button>)}
        </nav>
      </div>
      {section === 'general' ? <div className="space-y-6 p-5">
        <section className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-medium">Conversation goal</h3><span className="text-xs text-text-subtle">Read only</span></div>
          {node.task_messages.length === 0 && <p className="text-text-muted">No task messages.</p>}
          {node.task_messages.map((message, index) => <article key={index} className="overflow-hidden rounded-lg border border-ui-border">
            <div className="p-3.5">
              {typeof message.content === 'string' && <p className="whitespace-pre-wrap break-words leading-6">{message.content || 'Empty content.'}</p>}
              {typeof message.content !== 'string' && <Payload value={message} />}
            </div>
            <p className="border-t border-ui-border bg-workspace px-3.5 py-2 text-xs text-text-subtle">Message {index + 1}{typeof message.role === 'string' && ` · ${message.role}`}</p>
          </article>)}
        </section>
        {node.end && node.post_actions.length === 0 && <p className="flex items-center gap-2 text-xs text-text-muted"><PhoneOff className="size-4" />Conversation ends after this step.</p>}
        <details className="border-t border-ui-border pt-4"><summary className="cursor-pointer text-xs text-text-muted">Advanced details</summary>
          <div className="mt-5 space-y-5">
            <p className="break-all font-mono text-xs text-text-subtle">{node.name}{node.name === agent.initial_node && ' · Initial'}{node.end && ' · Terminal'}</p>
            <section><h3 className="mb-2 font-medium">Role message</h3><p className="mb-2 text-xs text-text-subtle">{node.role_message ? 'Node override' : 'Inherited persona'}</p><p className="whitespace-pre-wrap break-words leading-6 text-text-muted">{node.role_message || agent.persona || 'No persona provided.'}</p></section>
            <section><h3 className="mb-2 font-medium">Runtime settings</h3><p className="mb-3 text-xs text-text-subtle">Agent-wide</p><dl className="space-y-2 break-all text-xs"><dt className="text-text-subtle">Model</dt><dd>{agent.model}</dd><dt className="text-text-subtle">Voice ID</dt><dd>{agent.voice_id}</dd></dl></section>
            <section><h3 className="mb-2 font-medium">Node actions</h3>
              {node.end && node.post_actions.length > 0 && <p className="my-3 text-xs leading-5 text-text-muted">Explicit post-actions replace the default end-conversation action.</p>}
              <Payload value={{ end: node.end, pre_actions: node.pre_actions, post_actions: node.post_actions }} />
            </section>
            <section><h3 className="mb-2 font-medium">Native messages</h3><Payload value={{ role_message: node.role_message, task_messages: node.task_messages }} /></section>
          </div>
        </details>
      </div> : <section className="space-y-5 p-5">
        <div><h3 className="font-medium">Outgoing transitions</h3><p className="mt-1 text-xs leading-5 text-text-muted">When a function is called, the conversation moves to its next step.</p></div>
        {node.edges.length === 0 && <p className="text-text-muted">No outgoing transitions.</p>}
        {node.edges.map((edge, index) => <article key={index} className="space-y-3 border-b border-ui-border pb-5">
          <p className="break-words leading-6">{edge.description || 'No transition description.'}</p>
          <Button variant="outline" className="h-auto w-full justify-between py-3" aria-label={`→ ${edge.target}`} onClick={() => onSelect(edge.target)}><span className="truncate">{stepTitle(edge.target)}</span><ArrowRight className="shrink-0" /></Button>
          <p className="break-all font-mono text-xs text-text-subtle">{edge.function}</p>
          <details><summary className="cursor-pointer text-xs text-text-muted">Collected fields</summary><div className="pt-3"><CollectedFields edge={edge} /></div></details>
        </article>)}
      </section>}
    </> : <div className="space-y-6 p-5">
      <div><h2 className="text-lg font-medium">{agent.name}</h2><p className="mt-1 text-xs text-text-muted">Original scheduler · {agent.nodes.length} steps</p></div>
      <section><h3 className="mb-2 font-medium">Agent instructions</h3><p className="whitespace-pre-wrap break-words leading-6 text-text-muted">{agent.persona || 'No persona provided.'}</p></section>
      <section><h3 className="mb-3 font-medium">Conversation steps</h3><div className="space-y-1">{agent.nodes.map(item => <Button key={item.name} variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-3 text-left" onClick={() => onSelect(item.name)}>
        <MessageCircle className="shrink-0 text-text-subtle" /><span className="min-w-0"><span className="block truncate">{stepTitle(item.name)}</span><span className="mt-1 line-clamp-2 whitespace-normal text-xs font-normal leading-5 text-text-muted">{nodeDescription(item)}</span></span><ArrowRight className="ml-auto shrink-0 text-text-subtle" />
      </Button>)}</div></section>
      <details className="border-t border-ui-border pt-4"><summary className="cursor-pointer text-xs text-text-muted">Runtime details</summary><dl className="mt-3 space-y-2 break-all text-xs"><dt className="text-text-muted">Model</dt><dd>{agent.model}</dd><dt className="text-text-muted">Voice ID</dt><dd>{agent.voice_id}</dd><dt className="text-text-muted">Initial node</dt><dd>{agent.initial_node}</dd></dl></details>
    </div>}
  </div>;
}
