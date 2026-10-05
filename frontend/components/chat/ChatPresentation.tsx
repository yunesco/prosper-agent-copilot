"use client";

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, Copy, Square } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/textarea';
import { focusRing } from '@/components/ui/focus';

export type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string };
export type ChatActivity = { id: string; label: string; status: 'pending' | 'completed' | 'failed'; detail: string };
export type ChatStatus = 'idle' | 'pending' | 'streaming' | 'stopped' | 'error' | 'complete';

function MessageCopy({ text }: { text: string }) {
  const [result, setResult] = useState<'idle' | 'copied' | 'error'>('idle');
  return <div className="mt-2 flex flex-wrap items-center gap-2">
    <Button variant="ghost" size="sm" aria-label="Copy response" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setResult('copied'); }
      catch { setResult('error'); }
    }}>{result === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{result === 'copied' ? 'Copied' : 'Copy'}</Button>
    <span role="status" className="text-xs text-text-muted">{result === 'error' ? 'Couldn’t copy. Select and copy the text instead.' : result === 'copied' ? 'Response copied.' : ''}</span>
  </div>;
}

/** Presentation and input only. Transport, messages and tool state belong to AI SDK. */
export function ChatPresentation({ messages, activities = [], status, onSend, onStop, onRetry }: {
  messages: ChatMessage[];
  activities?: ChatActivity[];
  status: ChatStatus;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const busy = status === 'pending' || status === 'streaming';
  useEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages, activities, status]);
  const send = () => {
    if (!draft.trim() || busy) return;
    onSend(draft.trim());
    setDraft('');
    follow.current = true;
  };
  const statusLabel = {
    idle: '', pending: 'Waiting for a response…', streaming: 'Receiving response…',
    stopped: 'Response stopped.', error: 'Couldn’t complete the response. Try again.', complete: 'Response complete.',
  }[status];
  return <div className="flex min-h-0 flex-1 flex-col">
    <div ref={scroll} aria-label="Conversation messages" role="region" tabIndex={0}
      className={`min-h-0 flex-1 overflow-auto overscroll-contain px-5 py-5 ${focusRing}`}
      onScroll={event => {
        const element = event.currentTarget;
        follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        setAtBottom(follow.current);
      }}>
      {messages.length === 0 && <div className="py-8">
        <h2 className="text-base font-medium">Start with your guidelines</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">Describe the conversation you want to build. Suggestions will be available for review before they change the agent.</p>
      </div>}
      <div className="space-y-6">
        {messages.map(message => <article key={message.id} aria-label={message.role === 'user' ? 'Your message' : 'Copilot response'} className="min-w-0">
          <h3 className="mb-2 text-xs font-medium text-text-muted">{message.role === 'user' ? 'You' : 'Copilot'}</h3>
          <div dir="auto" className="min-w-0 max-w-prose text-sm leading-6 [overflow-wrap:anywhere] [&_p+p]:mt-3 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-medium [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface [&_pre]:p-3 [&_code]:font-mono [&_code]:text-xs [&_blockquote]:border-l [&_blockquote]:border-ui-border-strong [&_blockquote]:pl-3 [&_table]:w-full [&_td]:border-b [&_td]:border-ui-border [&_td]:p-2 [&_th]:p-2 [&_th]:text-left">
            <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
              // No remote media requests from model-authored Markdown.
              img: ({ alt }) => <span>{alt || 'Image omitted'}</span>,
              a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className={`text-accent-text underline underline-offset-4 ${focusRing}`}>{children}</a>,
              table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
            }}>{message.text}</Markdown>
          </div>
          {message.role === 'assistant' && !busy && <MessageCopy text={message.text} />}
        </article>)}
      </div>
      {activities.length > 0 && <details className="group mt-5 rounded-md border border-ui-border">
        <summary className={`flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 text-sm text-text-muted ${focusRing}`}>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 group-open:rotate-90" />Activity ({activities.length})
        </summary>
        <ul className="space-y-4 border-t border-ui-border p-3 text-sm">
          {activities.map(activity => <li key={activity.id} className="[overflow-wrap:anywhere]">
            <p className="font-medium">{activity.label}</p>
            <p className="mt-1 text-xs text-text-muted">{activity.status === 'pending' ? 'In progress' : activity.status === 'failed' ? 'Failed' : 'Completed'}</p>
            <p className="mt-1 leading-6 text-text-muted">{activity.detail}</p>
          </li>)}
        </ul>
      </details>}
    </div>
    {!atBottom && <div className="flex justify-center border-t border-ui-border py-2"><Button variant="outline" size="sm" onClick={() => {
      if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
      follow.current = true; setAtBottom(true);
    }}><ArrowDown aria-hidden="true" />Jump to latest</Button></div>}
    <div className="shrink-0 border-t border-ui-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className={status === 'error' ? 'text-sm text-error-text' : 'text-xs text-text-muted'}>{statusLabel}</p>
        {(status === 'error' || status === 'stopped') && <Button variant="outline" size="sm" onClick={onRetry}>Retry response</Button>}
      </div>
      <form onSubmit={event => { event.preventDefault(); send(); }}>
        <label htmlFor="chat-draft" className="mb-2 block text-sm font-medium">Message Copilot</label>
        <Textarea id="chat-draft" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Describe a change or ask a question…"
          className="max-h-48" onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
          }} />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-text-subtle">Shift + Enter for a new line</span>
          {busy ? <Button variant="outline" onClick={onStop}><Square aria-hidden="true" />Stop</Button> : <Button type="submit" disabled={!draft.trim()}><ArrowUp aria-hidden="true" />Send</Button>}
        </div>
      </form>
    </div>
  </div>;
}
