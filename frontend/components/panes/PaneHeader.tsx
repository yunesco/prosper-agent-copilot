import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import clsx from "clsx";

export type PaneHeaderContext = {
  actions: ReactNode;
  navigationInset: boolean;
};

/** The shared chrome for every workspace page. */
export function PaneHeader({
  children,
  actions,
  navigationInset = false,
}: {
  children: ReactNode;
  actions?: ReactNode;
  navigationInset?: boolean;
}) {
  return (
    <header
      data-workspace-header
      className={clsx(
        "flex h-12 min-h-12 shrink-0 items-center justify-between gap-2 px-3 lg:h-16 lg:min-h-16 lg:px-4 print:hidden",
        navigationInset && "pl-14 lg:pl-4",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      ) : null}
    </header>
  );
}

/** One icon-and-title pattern for page labels and document controls. */
export function PaneTitle({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon
        aria-hidden="true"
        className="hidden size-4 shrink-0 text-text-muted lg:block"
      />
      <h1 className="min-w-0 text-sm leading-5 font-medium">
        {typeof children === "string" ? (
          <span className="block truncate" title={children}>
            {children}
          </span>
        ) : (
          children
        )}
      </h1>
    </div>
  );
}
