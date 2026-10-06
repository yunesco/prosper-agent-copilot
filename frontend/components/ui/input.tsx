import * as React from 'react';
import { cn } from '@/lib/utils';

// Standard shadcn/ui input, using the workspace theme tokens.
// Keep touch inputs at 16px even when desktop or caller typography is smaller; Safari otherwise zooms on focus.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 pointer-coarse:min-h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-base transition-colors duration-150 motion-reduce:transition-none outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive md:text-sm pointer-coarse:!text-base',
        className,
      )}
      {...props}
    />
  );
}
export { Input };
