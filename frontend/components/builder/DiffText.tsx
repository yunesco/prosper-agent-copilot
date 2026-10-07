import { diffWords } from '@/lib/agent/text-diff';
import { cn } from '@/lib/utils';

/** Word diff with semantic ins/del, so the change is not conveyed by color alone. */
export function DiffText({
  before,
  after,
  className,
}: {
  before: string;
  after: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {diffWords(before, after).map((part, index) =>
        part.kind === 'same' ? (
          part.text
        ) : part.kind === 'added' ? (
          <ins key={index} className={cn('rounded-[2px] bg-diff-add-soft text-diff-add no-underline')}>
            {part.text}
          </ins>
        ) : (
          <del key={index} className="rounded-[2px] bg-diff-remove-soft text-diff-remove">
            {part.text}
          </del>
        ),
      )}
    </span>
  );
}
