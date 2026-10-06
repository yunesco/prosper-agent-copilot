'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { AgentEditor } from './use-node-edits';

/** Draft status with Save and Cancel. A draft is one unit across graph edits and guidelines. */
export function SaveFooter({ editor, onCancel }: { editor: AgentEditor; onCancel: () => void }) {
  return (
    <div className="sticky bottom-0 z-10 mt-auto space-y-2 border-t border-ui-border bg-surface-raised px-5 py-3">
      {editor.unfinishedField && (
        <p role="alert" className="text-xs text-text-muted">
          Finish or cancel field edits before saving.
        </p>
      )}
      {editor.invalidCollection && (
        <p role="alert" className="text-xs text-destructive">
          Fix collected fields JSON before saving.
        </p>
      )}
      {editor.error && (
        <p role="alert" className="break-words text-xs leading-5 text-destructive">
          {editor.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          role="status"
          className={cn(
            'flex items-center gap-1.5 text-xs',
            editor.saved && !editor.dirty ? 'text-foreground' : 'text-text-muted',
          )}
        >
          {editor.saved && !editor.dirty && <Check aria-hidden="true" className="size-3.5" />}
          {editor.pending
            ? 'Saving…'
            : editor.dirty
              ? 'Unsaved changes'
              : editor.saved
                ? 'Changes saved'
                : 'Saved'}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="transition-colors"
            disabled={!editor.dirty && !editor.pending}
            onClick={() => {
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            className="min-w-16"
            disabled={!editor.dirty || editor.pending || editor.invalidCollection || editor.unfinishedField}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
