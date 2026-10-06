import type { RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Save / Cancel / Keep editing decision before switching agents with an unsaved draft. */
export function UnsavedChangesDialog({
  open,
  error,
  pending,
  canSave,
  keepEditingRef,
  finalFocusRef,
  onSave,
  onDiscard,
  onKeepEditing,
}: {
  open: boolean;
  error: string;
  pending: boolean;
  canSave: boolean;
  keepEditingRef: RefObject<HTMLButtonElement | null>;
  finalFocusRef: RefObject<HTMLButtonElement | null>;
  onSave: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={next => !next && onKeepEditing()}>
      <DialogContent initialFocus={keepEditingRef} finalFocus={finalFocusRef} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Unsaved agent changes</DialogTitle>
          <DialogDescription>Save your changes before switching agents?</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button disabled={pending || !canSave} onClick={onSave}>
            {pending ? 'Saving…' : 'Save and switch'}
          </Button>
          <Button variant="outline" onClick={onDiscard}>
            Cancel edits and switch
          </Button>
          <Button ref={keepEditingRef} variant="ghost" onClick={onKeepEditing}>
            Keep editing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
