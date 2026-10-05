"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { PaneHeader } from './PaneHeader';
import { PaneDivider } from './PaneDivider';
import { clampSplit, DEFAULT_SPLIT, MAX_SPLIT, MIN_SPLIT } from './pane-split';

type Surface = 'workspace' | 'context';

/** Layout only: children keep their identity, scroll positions and local state. */
export function PaneWorkspace({ workspace, context, workspaceTitle = 'Conversation', contextTitle = 'Agent details' }: { workspace: ReactNode | ((openContext: () => void) => ReactNode); context: ReactNode; workspaceTitle?: ReactNode; contextTitle?: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const workspaceRegion = useRef<HTMLElement>(null);
  const contextRegion = useRef<HTMLElement>(null);
  const rememberedFocus = useRef<Partial<Record<Surface, HTMLElement>>>({});
  const pendingFocus = useRef<Surface | null>(null);
  const [split, setSplit] = useState(DEFAULT_SPLIT);
  const [maxSplit, setMaxSplit] = useState(MAX_SPLIT);
  const [open, setOpen] = useState(true);
  const [mobile, setMobile] = useState<Surface>('workspace');
  const value = clampSplit(split, MIN_SPLIT, maxSplit);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      // Reserve 320px for details at desktop widths; mobile has one full-width pane.
      const width = entry.contentRect.width;
      if (width >= 768) setMaxSplit(Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, 100 * (width - 328) / (width - 8))));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const focusImmediately = (surface: Surface) => {
    const region = surface === 'workspace' ? workspaceRegion.current : contextRegion.current;
    const remembered = rememberedFocus.current[surface];
    if (remembered?.isConnected && remembered.getClientRects().length) remembered.focus({ preventScroll: true });
    else region?.focus({ preventScroll: true });
  };
  const focusSurface = (surface: Surface) => { pendingFocus.current = surface; };
  // Restore during the commit, before another keyboard action can take focus.
  useLayoutEffect(() => {
    if (pendingFocus.current) {
      focusImmediately(pendingFocus.current);
      pendingFocus.current = null;
    }
  });

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const onChange = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && container.current?.contains(active) && !active.getClientRects().length) {
        focusImmediately(query.matches ? 'workspace' : mobile);
      }
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [mobile]);

  const show = (surface: Surface) => {
    setOpen(true); setMobile(surface); focusSurface(surface);
  };
  const isSplit = open;

  return <div className="flex min-h-0 flex-1 flex-col">
    <nav aria-label="Workspace surface" className="flex shrink-0 gap-1 border-b border-ui-border bg-surface-raised px-3 py-2 md:hidden">
      <Button variant="ghost" size="sm" className="aria-pressed:bg-accent-soft aria-pressed:text-accent-text" aria-pressed={mobile === 'workspace'} aria-controls="workspace-pane" onClick={() => show('workspace')}>Graph</Button>
      <Button variant="ghost" size="sm" className="aria-pressed:bg-accent-soft aria-pressed:text-accent-text" aria-pressed={mobile === 'context'} aria-controls="context-pane" onClick={() => show('context')}>Details</Button>
    </nav>
    <div ref={container} style={{ '--pane-columns': `${value}fr 8px ${100 - value}fr` } as CSSProperties}
      className={cn('grid min-h-0 flex-1 grid-cols-1', isSplit && 'md:grid-cols-[var(--pane-columns)]')}>
      <section ref={workspaceRegion} id="workspace-pane" aria-label="Conversation workspace" tabIndex={-1}
        className={cn('min-h-0 min-w-0 flex-col bg-workspace outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent', mobile === 'workspace' ? 'flex' : 'hidden', 'md:flex')}>
        <PaneHeader actions={<div className="hidden items-center gap-1 md:flex">
          {!open && <Button variant="ghost" size="icon" aria-label="Open details" title="Open details" onClick={() => show('context')}><PanelRightOpen aria-hidden="true" /></Button>}
        </div>}><div className="text-sm font-medium">{workspaceTitle}</div></PaneHeader>
        <div data-pane-content="workspace" className="min-h-0 flex-1 overflow-auto overscroll-contain" onFocusCapture={event => { rememberedFocus.current.workspace = event.target; }}>{typeof workspace === 'function' ? workspace(() => setOpen(true)) : workspace}</div>
      </section>
      {isSplit && <PaneDivider container={container} value={value} max={maxSplit} controls="workspace-pane context-pane" onResize={setSplit} onCommit={setSplit} />}
      <section ref={contextRegion} id="context-pane" aria-label="Agent details" tabIndex={-1}
        className={cn('min-h-0 min-w-0 flex-col bg-surface-raised outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent', mobile === 'context' ? 'flex' : 'hidden', !open ? 'md:hidden' : 'md:flex')}>
        <PaneHeader actions={<div className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="icon" aria-label="Close details" title="Close details" onClick={() => { setOpen(false); setMobile('workspace'); focusSurface('workspace'); }}><PanelRightClose aria-hidden="true" /></Button>
        </div>}><div className="text-sm font-medium">{contextTitle}</div></PaneHeader>
        <div data-pane-content="context" className="flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain" onFocusCapture={event => { rememberedFocus.current.context = event.target; }}>{context}</div>
      </section>
    </div>
  </div>;
}
