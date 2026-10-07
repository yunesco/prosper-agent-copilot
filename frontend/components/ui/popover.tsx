// shadcn/ui base-nova (MIT; see THIRD_PARTY_NOTICES.md).
'use client';

import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

// Scales from its trigger (origin-aware), 150ms ease-out in, faster out; opacity only for reduced motion.
function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  initialFocus,
  ...props
}: PopoverPrimitive.Popup.Props & Pick<PopoverPrimitive.Positioner.Props, 'align' | 'sideOffset'>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner align={align} sideOffset={sideOffset} className="isolate z-50">
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          initialFocus={initialFocus}
          className={cn(
            'w-80 max-w-[calc(100vw-2rem)] origin-(--transform-origin) rounded-xl bg-popover p-1.5 text-sm text-popover-foreground shadow-overlay ring-1 ring-foreground/10 outline-none transition-[opacity,scale] duration-150 ease-(--ease-snappy) data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-100 data-starting-style:scale-[0.97] data-starting-style:opacity-0 motion-reduce:transition-none motion-reduce:data-ending-style:scale-100 motion-reduce:data-starting-style:scale-100',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
