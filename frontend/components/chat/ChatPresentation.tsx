'use client';

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  LoaderCircle,
  Square,
  TriangleAlert,
} from 'lucide-react';
import { ActivityDrawer, type ChatActivity } from './ActivityDrawer';
import { MarkdownContent } from './MarkdownContent';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/textarea';
import { focusRing } from '@/components/ui/focus';

export type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string };
export type { ChatActivity } from './ActivityDrawer';
export type ChatEmptyState = {
  title: string;
  body: string;
  suggestions: { label: string; prompt: string }[];
};
export type ChatStatus = 'idle' | 'pending' | 'streaming' | 'stopped' | 'error' | 'complete';

function MessageCopy({ text }: { text: string }) {
  const [result, setResult] = useState<'idle' | 'copied' | 'error'>('idle');
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        aria-label="Copy response"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setResult('copied');
          } catch {
            setResult('error');
          }
        }}
      >
        {result === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {result === 'copied' ? 'Copied' : 'Copy'}
      </Button>
      <span role="status" className="text-xs text-text-muted">
        {result === 'error'
          ? 'Couldn’t copy. Select and copy the text instead.'
          : result === 'copied'
            ? 'Response copied.'
            : ''}
      </span>
    </div>
  );
}

/** Presentation and input only. Transport, messages and tool state belong to AI SDK. */
export function ChatPresentation({
  messages,
  activities = [],
  status,
  onSend,
  onStop,
  onRetry,
  errorMessage,
  children,
  revealKey,
  resolveLink,
  empty = {
    title: 'Start with your guidelines',
    body: 'Describe the conversation you want to build.',
    suggestions: [],
  },
}: {
  resolveLink?: ComponentProps<typeof MarkdownContent>['resolveLink'];
  empty?: ChatEmptyState;
  revealKey?: string;
  children?: ReactNode;
  errorMessage?: string;
  messages: ChatMessage[];
  activities?: ChatActivity[];
  status: ChatStatus;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
}) {
  const [draft, setDraft] = useState('');
  const lastSent = useRef('');
  const restoredDraft = useRef(false);
  useEffect(() => {
    if (status === 'error')
      setDraft(current => {
        if (current || !lastSent.current) return current;
        restoredDraft.current = true;
        return lastSent.current;
      });
  }, [status]);
  const [atBottom, setAtBottom] = useState(true);
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const busy = status === 'pending' || status === 'streaming';
  const revealed = useRef<string | undefined>(undefined);
  useEffect(() => {
    const region = scroll.current;
    const newResult = revealKey !== undefined && revealKey !== revealed.current;
    revealed.current = revealKey;
    if (!region || !follow.current) return;
    const result = newResult ? [...region.querySelectorAll<HTMLElement>('[data-chat-reveal]')].at(-1) : null;
    if (result) {
      region.scrollTop += result.getBoundingClientRect().top - region.getBoundingClientRect().top;
      follow.current = region.scrollHeight - region.scrollTop - region.clientHeight < 48;
      setAtBottom(follow.current);
    } else region.scrollTop = region.scrollHeight;
  }, [messages, activities, status, children, revealKey]);
  const send = () => {
    if (!draft.trim() || busy) return;
    restoredDraft.current = false;
    lastSent.current = draft.trim();
    onSend(draft.trim());
    setDraft('');
    follow.current = true;
  };
  const retry = () => {
    if (restoredDraft.current) {
      setDraft('');
      restoredDraft.current = false;
    }
    onRetry();
  };
  const statusLabel = {
    idle: '',
    pending: 'Waiting for a response…',
    streaming: 'Receiving response…',
    stopped: 'Response stopped.',
    error: 'Couldn’t complete the response. Try again.',
    complete: 'Response complete.',
  }[status];
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={scroll}
        aria-label="Conversation messages"
        role="region"
        tabIndex={0}
        className={`min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain px-4 py-5 sm:px-5 ${focusRing}`}
        onScroll={event => {
          const element = event.currentTarget;
          follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
          setAtBottom(follow.current);
        }}
      >
        {messages.length === 0 && !busy && !errorMessage && (
          <div className="px-1 py-8">
            <h2 className="text-balance text-xl font-semibold leading-7 tracking-[-0.015em]">
              {empty.title}
            </h2>
            <p className="mt-2 max-w-[44ch] text-pretty text-[15px] leading-6 text-text-muted">
              {empty.body}
            </p>
            {empty.suggestions.length > 0 && (
              <ul className="mt-6 space-y-2">
                {empty.suggestions.map(item => (
                  <li key={item.label}>
                    <Button
                      variant="outline"
                      className="h-11 w-full justify-between rounded-xl px-4 text-[15px] font-medium transition-transform duration-100 active:scale-[0.98] motion-reduce:transition-none"
                      onClick={() => onSend(item.prompt)}
                    >
                      {item.label}
                      <ChevronRight aria-hidden="true" className="size-4 text-text-muted" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="space-y-6">
          {messages
            .filter(message => message.text.trim())
            .map(message => (
              <article
                key={message.id}
                aria-label={message.role === 'user' ? 'Your message' : 'Copilot response'}
                className={
                  message.role === 'user' ? 'ml-5 min-w-0 rounded-xl bg-surface px-4 py-3' : 'min-w-0'
                }
              >
                <h3 className="mb-2 text-xs font-medium text-text-muted">
                  {message.role === 'user' ? 'You' : 'Copilot'}
                </h3>
                <MarkdownContent resolveLink={message.role === 'assistant' ? resolveLink : undefined}>
                  {message.text}
                </MarkdownContent>
                {message.role === 'assistant' && !busy && <MessageCopy text={message.text} />}
              </article>
            ))}
        </div>
        {children}
        <ActivityDrawer activities={activities} />
      </div>
      {!atBottom && (
        <div className="flex justify-center border-t border-ui-border py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
              follow.current = true;
              setAtBottom(true);
            }}
          >
            <ArrowDown aria-hidden="true" />
            Jump to latest
          </Button>
        </div>
      )}
      <div className="max-h-1/2 shrink-0 overflow-y-auto border-t border-ui-border p-4">
        {errorMessage && (
          <p role="alert" className="mb-3 text-sm leading-5 text-error-text [overflow-wrap:anywhere]">
            {errorMessage}
          </p>
        )}
        <div
          className={
            status === 'idle' || status === 'complete'
              ? 'sr-only'
              : 'mb-3 flex flex-wrap items-center justify-between gap-2'
          }
        >
          <p
            role="status"
            aria-live="polite"
            className={status === 'error' ? 'text-sm text-error-text' : 'text-xs text-text-muted'}
          >
            {busy && (
              <LoaderCircle
                aria-hidden="true"
                className="mr-1.5 inline size-3.5 animate-spin motion-reduce:animate-none"
              />
            )}
            {status === 'error' && <TriangleAlert aria-hidden="true" className="mr-1.5 inline size-4" />}
            {statusLabel}
          </p>
          {(status === 'error' || status === 'stopped') && (
            <Button variant="outline" size="sm" onClick={retry}>
              Retry response
            </Button>
          )}
        </div>
        <form
          className="rounded-xl border border-ui-border bg-background p-2 focus-within:border-ring"
          onSubmit={event => {
            event.preventDefault();
            send();
          }}
        >
          <label htmlFor="chat-draft" className="sr-only">
            Message Copilot
          </label>
          <Textarea
            id="chat-draft"
            enterKeyHint="send"
            value={draft}
            onChange={event => {
              restoredDraft.current = false;
              setDraft(event.target.value);
            }}
            placeholder="Ask Copilot to build or improve your agent…"
            aria-describedby="chat-composer-hint"
            className="min-h-16 max-h-40 resize-none rounded-lg border-0 bg-transparent px-2 py-1.5 leading-6 focus-visible:ring-0"
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div className="mt-1 flex items-center justify-between gap-3 pl-2">
            <span id="chat-composer-hint" className="text-xs leading-5 text-text-muted">
              Shift + Enter for a new line
            </span>
            {busy ? (
              <Button variant="outline" onClick={onStop}>
                <Square aria-hidden="true" />
                Stop
              </Button>
            ) : (
              <Button type="submit" disabled={!draft.trim()}>
                <ArrowUp aria-hidden="true" />
                Send
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
