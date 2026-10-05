import type { ReactNode } from 'react';

export function PaneHeader({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-ui-border px-4 py-2">
    <div className="min-w-0 flex-1">{children}</div>
    {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
  </header>;
}
