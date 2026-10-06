import type { ReactNode } from 'react';
import { focusRing } from '@/components/ui/focus';

/** Inline reference in Copilot prose to a transcript turn or graph element. */
export function EvidenceChip({
  children,
  title,
  onClick,
}: {
  children: ReactNode;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`mx-0.5 inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 align-baseline font-sans text-xs font-medium text-accent-text hover:underline ${focusRing}`}
    >
      {children}
    </button>
  );
}
