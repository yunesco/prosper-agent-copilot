import { GitBranch, Phone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PaneWorkspace } from '@/components/panes/PaneWorkspace';

export function BuilderShell() {
  return <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-chrome pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]">
    <header className="flex shrink-0 flex-wrap items-center gap-x-8 gap-y-3 border-b border-ui-border bg-surface-raised px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <span className="text-base font-semibold tracking-tight">prosper<span className="text-accent-text">.</span></span>
        <span className="h-5 border-l border-ui-border" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="text-sm font-medium">Agent builder</h1>
          <p className="text-xs leading-5 text-text-subtle">No agent loaded</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 md:ml-auto">
          <nav aria-label="Agent mode" className="inline-flex items-center gap-1 rounded-full border border-ui-border bg-surface-raised p-1">
            <Button variant="ghost" size="sm" aria-current="page" className="rounded-full bg-accent-soft text-accent-text"><GitBranch aria-hidden="true" />Builder</Button>
            <Button variant="ghost" size="sm" className="rounded-full" disabled aria-describedby="call-unavailable"><Phone aria-hidden="true" />Test Call</Button>
          </nav>
          <p id="call-unavailable" className="text-xs text-text-subtle">Unavailable</p>
        </div>
    </header>
    <PaneWorkspace
      workspace={<div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <GitBranch aria-hidden="true" className="mx-auto mb-5 size-7 text-text-subtle" strokeWidth={1.5} />
          <h2 className="text-xl font-medium tracking-tight">Your agent’s conversation, mapped</h2>
          <p className="mt-3 text-sm leading-6 text-text-muted">When an agent is loaded, its steps and transitions will appear here.</p>
        </div>
      </div>}
      context={<div className="px-5 py-6">
        <h2 className="text-sm font-medium">A closer look at each step</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">Agent details and step instructions will appear here as you explore the conversation.</p>
        <div className="mt-8 border-t border-ui-border pt-5">
          <h3 className="text-sm font-medium">Copilot</h3>
          <p className="mt-2 text-sm leading-6 text-text-muted">Guideline-based creation and reviewed suggestions are coming next.</p>
          <p className="mt-4 text-xs text-text-subtle">Not connected yet</p>
        </div>
      </div>}
    />
  </main>;
}
