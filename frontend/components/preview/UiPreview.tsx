"use client";

import { useState } from 'react';
import { ChatPresentation, type ChatMessage, type ChatStatus } from '@/components/chat/ChatPresentation';
import { PaneWorkspace } from '@/components/panes/PaneWorkspace';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/textarea';
import { focusRing } from '@/components/ui/focus';

const response = 'This is a **synthetic presentation preview**. No model or tool has run.\n\n- Review each proposed change.\n- Keep the current agent unchanged until approval.\n\n`example_step` is a presentation label, not a loaded graph node.';
const worst = 'Aleksandra Wiśniewska-Kowalczyk · 王秀英 · نور الهدى عبد الرحمن\n\nbartholomew.fitzgerald@northwind-industries-holdings.example.com\n\n' + response + '\n\n```text\nhttps://example.com/workspaces/clinic/projects/conversation-review/9f8e7d6c5b4a?tab=comments&filter=unresolved\n```\n\n| Item | Note |\n| --- | --- |\n| Benachrichtigungseinstellungen | A long label remains readable. |';
const statuses: ChatStatus[] = ['idle', 'pending', 'streaming', 'stopped', 'error', 'complete'];

/** Only imported by the opt-in preview route. No provider, fixtures or agent mutations. */
export function UiPreview() {
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [data, setData] = useState<'demo' | 'worst'>('demo');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sequence, setSequence] = useState(0);
  const changeStatus = (next: ChatStatus) => {
    setStatus(next);
    setMessages(next === 'idle' ? [] : [{ id: 'question', role: 'user', text: 'Show a sample reviewed suggestion.' },
      ...(next === 'pending' ? [] : [{ id: 'answer', role: 'assistant' as const, text: next === 'streaming' ? 'This is a **synthetic' : (data === 'worst' ? worst : response) }])]);
  };
  return <main className="flex h-dvh min-h-0 flex-col bg-app-chrome">
    <header className="shrink-0 border-b border-ui-border bg-surface-raised px-4 py-3">
      <h1 className="text-base font-semibold">UI preview · Synthetic data</h1>
      <p className="mt-1 text-xs text-text-muted">Presentation only. No model, voice service, tools, or agent changes.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="preview-state" className="text-sm">Chat state</label>
        <select id="preview-state" value={status} className={`rounded-md border border-ui-border bg-surface-raised p-2 text-base ${focusRing}`} onChange={event => {
          const next = statuses.find(value => value === event.target.value);
          if (next) changeStatus(next);
        }}>{statuses.map(value => <option key={value}>{value}</option>)}</select>
        <Button variant="outline" size="sm" onClick={() => {
          setSequence(sequence + 1);
          setMessages(current => [...current, { id: `extra-${sequence}`, role: 'assistant', text: data === 'worst' ? worst : response }]);
        }}>Append sample</Button>
        {status === 'streaming' && <Button variant="outline" size="sm" onClick={() => setMessages(current => current.map(message => message.id === 'answer' ? { ...message, text: message.text + ' preview** with another streamed chunk.' } : message))}>Next chunk</Button>}
      </div>
    </header>
    <PaneWorkspace workspace={<div className="space-y-6 p-6">
      <div><h2 className="text-lg font-medium">Pane retention preview</h2><p className="mt-2 text-sm text-text-muted">Edit the note, move between panes, and return. Its contents and scroll position should remain.</p></div>
      <div><label htmlFor="preview-note" className="mb-2 block text-sm font-medium">Workspace note</label><Textarea id="preview-note" placeholder="Type a note to test retention" /></div>
      {data === 'worst' && Array.from({ length: 20 }, (_, index) => <p key={index} className="text-sm leading-6 [overflow-wrap:anywhere]">Synthetic paragraph {index + 1}: {worst}</p>)}
    </div>} context={<ChatPresentation messages={messages} status={status}
      activities={status === 'idle' ? [] : [{ id: 'preview-activity', label: 'Synthetic activity', status: status === 'error' ? 'failed' : status === 'pending' ? 'pending' : 'completed', detail: 'An illustrative status entry. No tool executed.' }]}
      onSend={text => { setMessages(current => [...current, { id: `input-${sequence}`, role: 'user', text }]); setSequence(sequence + 1); setStatus('pending'); }}
      onStop={() => setStatus('stopped')} onRetry={() => setStatus('pending')} />} />
    <footer className="flex shrink-0 justify-center gap-1 border-t border-ui-border bg-surface-raised p-2" aria-label="Preview data">
      <Button variant="ghost" size="sm" className="aria-pressed:bg-accent-soft aria-pressed:text-accent-text" aria-pressed={data === 'demo'} onClick={() => { setData('demo'); setMessages(current => current.map(message => message.role === 'assistant' ? { ...message, text: response } : message)); }}>Demo data</Button>
      <Button variant="ghost" size="sm" className="aria-pressed:bg-accent-soft aria-pressed:text-accent-text" aria-pressed={data === 'worst'} onClick={() => { setData('worst'); setMessages(current => current.map(message => message.role === 'assistant' ? { ...message, text: worst } : message)); }}>Worst case</Button>
    </footer>
  </main>;
}
