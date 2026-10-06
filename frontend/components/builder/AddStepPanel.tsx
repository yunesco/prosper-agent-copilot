'use client';

import { useState } from 'react';
import { Panel, type XYPosition } from '@xyflow/react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { stepTitle } from '@/lib/agent/graph';
import { cn } from '@/lib/utils';

/** Floating form that adds a step, optionally connected after `source`. Draft fields live here. */
export function AddStepPanel({
  source,
  point,
  animate,
  pending,
  onSubmit,
  onClose,
}: {
  source: string | null;
  point?: XYPosition;
  animate: boolean;
  pending: boolean;
  onSubmit: (name: string, end: boolean, condition: string, goal: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [condition, setCondition] = useState('');
  const [kind, setKind] = useState('conversation');
  const valid = !pending && !!name.trim() && !!goal.trim() && (source === null || !!condition.trim());
  return (
    <Panel
      position="top-left"
      style={point ? { left: point.x, top: point.y } : undefined}
      className={cn(
        point ? '!m-0' : '!mt-16',
        ' max-h-[calc(100%-5rem)] w-80 max-w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-xl bg-surface-raised p-4 shadow-overlay',
        animate &&
          'motion-safe:transition-[opacity,translate] motion-safe:duration-150 motion-safe:ease-snappy motion-safe:starting:opacity-0 motion-safe:starting:-translate-y-1',
      )}
    >
      <form
        aria-label="Add step"
        className="space-y-4"
        onSubmit={event => {
          event.preventDefault();
          if (!valid) return;
          onSubmit(name, kind === 'end', condition, goal);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{source ? 'Add connected step' : 'Add step'}</h3>
            <p className="mt-1 text-xs leading-5 text-text-muted [overflow-wrap:anywhere]">
              {source ? `After ${stepTitle(source)}` : 'Define what happens in this part of the call.'}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close add step" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
        <label className="block space-y-1.5 text-xs font-medium">
          Step name
          <Input
            autoFocus
            aria-label="Step name"
            placeholder="e.g. Collect insurance"
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          Step type
          <Select
            value={kind}
            onValueChange={value => {
              if (!value) return;
              setKind(value);
              if (value === 'end' && !goal.trim()) setGoal('Say goodbye.');
            }}
          >
            <SelectTrigger aria-label="Step type">
              <SelectValue>{kind === 'end' ? 'End conversation' : 'Conversation'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="conversation">Conversation</SelectItem>
              <SelectItem value="end">End conversation</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          Conversation goal
          <Textarea
            aria-label="Conversation goal"
            className="min-h-24 resize-y font-normal leading-6"
            placeholder="e.g. Ask which insurance provider the caller uses."
            value={goal}
            onChange={event => setGoal(event.target.value)}
          />
        </label>
        {source !== null && (
          <label className="block space-y-1.5 border-t border-ui-border pt-3 text-xs font-medium">
            When to enter this step
            <Textarea
              aria-label="New transition condition"
              className="min-h-24 resize-y font-normal leading-6"
              placeholder="e.g. The caller is a new patient."
              value={condition}
              onChange={event => setCondition(event.target.value)}
            />
          </label>
        )}

        <Button type="submit" className="h-9 w-full" disabled={!valid}>
          Add step
        </Button>
      </form>
    </Panel>
  );
}
