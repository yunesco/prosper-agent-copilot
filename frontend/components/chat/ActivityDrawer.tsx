import type { ComponentType } from 'react';
import { Check, ChevronRight, CircleAlert, LoaderCircle, Wrench } from 'lucide-react';
import { focusRing } from '@/components/ui/focus';

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
export type ChatActivity = {
  id: string;
  label: string;
  status: 'pending' | 'completed' | 'failed' | 'interrupted';
  detail: string;
  icon?: Icon;
};

const statusText = { pending: 'In progress', failed: 'Failed', interrupted: 'Interrupted', completed: '' };

function StatusIcon({ status }: { status: ChatActivity['status'] }) {
  if (status === 'pending')
    return <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />;
  if (status === 'failed') return <CircleAlert aria-hidden="true" className="size-3.5 text-error-text" />;
  if (status === 'completed') return <Check aria-label="Completed" className="size-3.5" />;
  return null;
}

/** What Copilot did: collapsed to a count and tool icons, expandable to each step and its result. */
export function ActivityDrawer({ activities }: { activities: ChatActivity[] }) {
  if (!activities.length) return null;
  const count = (status: ChatActivity['status']) => activities.filter(item => item.status === status).length;
  const failed = count('failed');
  const interrupted = count('interrupted');
  const running = count('pending') > 0;
  const icons = [...new Set(activities.map(item => item.icon ?? Wrench))].slice(0, 4);
  return (
    <details className="group mt-5 border-t border-ui-border pt-2">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 rounded-md py-2 text-xs text-text-muted ${focusRing}`}
      >
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 group-open:rotate-90" />
        <span className="flex shrink-0 -space-x-1">
          {icons.map((Icon, index) => (
            <span
              key={index}
              className="flex size-5 items-center justify-center rounded-full border border-ui-border bg-surface-raised"
            >
              <Icon aria-hidden="true" className="size-3" />
            </span>
          ))}
        </span>
        <span className="shrink-0">Activity ({activities.length})</span>
        {failed > 0 ? (
          <span className="ml-auto text-error-text">{failed} failed</span>
        ) : running ? (
          <span className="ml-auto flex min-w-0 items-center gap-1.5">
            <StatusIcon status="pending" />
            <span className="truncate">In progress</span>
          </span>
        ) : interrupted > 0 ? (
          <span className="ml-auto">{interrupted} interrupted</span>
        ) : (
          <span className="ml-auto">
            <StatusIcon status="completed" />
          </span>
        )}
      </summary>
      <ol className="ml-2 space-y-1 border-l border-ui-border py-2 pl-3 text-sm">
        {activities.map(activity => {
          const Icon = activity.icon ?? Wrench;
          return (
            // Failures open by default: the reason is the point of looking.
            <li key={activity.id} className="[overflow-wrap:anywhere]">
              <details className="group/step" open={activity.status === 'failed'}>
                <summary
                  className={`flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-md ${focusRing}`}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
                  <span className="min-w-0 flex-1 font-medium">{activity.label}</span>
                  {statusText[activity.status] && (
                    <span
                      className={`text-xs ${activity.status === 'failed' ? 'text-error-text' : 'text-text-muted'}`}
                    >
                      {statusText[activity.status]}
                    </span>
                  )}
                  <StatusIcon status={activity.status} />
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-text-muted group-open/step:rotate-90"
                  />
                </summary>
                <p className="py-1 pl-6 text-xs leading-5 text-text-muted">{activity.detail}</p>
              </details>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
