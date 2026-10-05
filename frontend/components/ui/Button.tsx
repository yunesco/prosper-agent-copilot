import clsx from "clsx";
import type { ButtonHTMLAttributes, ComponentPropsWithRef } from "react";
import { focusRing, pressable } from "@/components/ui/focus";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
type ButtonShape = "rect" | "capsule" | "menu";
type ButtonAlignment = "center" | "start";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-content shadow-raised hover:bg-primary/88 aria-busy:bg-primary/80",
  secondary:
    "border border-ui-border bg-surface-raised text-base-content shadow-[0_1px_1px_oklch(0_0_0/4%)] hover:border-ui-border-strong hover:bg-selection aria-busy:bg-selection",
  ghost:
    "text-text-muted hover:bg-base-content/[0.06] hover:text-base-content active:bg-base-content/10",
  danger:
    "bg-error text-error-content shadow-raised hover:bg-error/90 aria-busy:bg-error/80",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-[13px] leading-4 font-medium pointer-coarse:h-10",
  md: "h-9 gap-2 px-3.5 text-sm leading-5 font-medium pointer-coarse:h-11",
  lg: "h-11 gap-2 px-5 text-[15px] leading-5 font-medium",
};

const shapeClasses: Record<ButtonShape, string> = {
  rect: "rounded-lg",
  capsule: "rounded-full",
  menu: "rounded-md",
};

const alignmentClasses: Record<ButtonAlignment, string> = {
  center: "justify-center",
  start: "justify-start text-left",
};

export function buttonStyles({
  variant = "secondary",
  size = "md",
  shape = "rect",
  align = "center",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  align?: ButtonAlignment;
  className?: string;
} = {}) {
  return clsx(
    "inline-flex shrink-0 cursor-default items-center whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-40 aria-busy:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    shape !== "menu" && pressable,
    shape === "menu" && "transition-colors duration-150",
    focusRing,
    variantClasses[variant],
    sizeClasses[size],
    shapeClasses[shape],
    alignmentClasses[align],
    className,
  );
}

/** Pending buttons keep their label's width (the pending label overlays it),
 * block another submission, and say what is happening, e.g. "Saving…". */
export default function Button({
  variant = "secondary",
  size = "md",
  shape = "rect",
  align = "center",
  pending = false,
  pendingLabel = "Saving…",
  className,
  type = "button",
  children,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  align?: ButtonAlignment;
  pending?: boolean;
  pendingLabel?: string;
}) {
  return (
    <button
      type={type}
      data-ui-button
      aria-busy={pending || undefined}
      onClick={pending ? (event) => event.preventDefault() : onClick}
      className={buttonStyles({
        variant,
        size,
        shape,
        align,
        className: clsx(pending && "relative", className),
      })}
      {...props}
    >
      {pending ? (
        <>
          <span className="invisible contents">{children}</span>
          <span className="absolute inset-0 flex items-center justify-center">
            {pendingLabel}
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

const iconSizeClasses: Record<ButtonSize | "xs", string> = {
  xs: "size-6 [&_svg]:size-3.5",
  sm: "size-8 [&_svg]:size-4 pointer-coarse:size-10",
  md: "size-9 [&_svg]:size-4 pointer-coarse:size-11",
  lg: "size-11 [&_svg]:size-5",
};

export function IconButton({
  variant = "ghost",
  size = "md",
  shape = "rect",
  embedded = false,
  className,
  type = "button",
  ...props
}: ComponentPropsWithRef<"button"> & {
  "aria-label": string;
  /** Let the containing row provide hover/pressed backgrounds. */
  embedded?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize | "xs";
  shape?: "rect" | "circle";
}) {
  return (
    <button
      type={type}
      data-ui-button
      className={clsx(
        "inline-flex shrink-0 cursor-default items-center justify-center select-none disabled:pointer-events-none disabled:opacity-35 aria-pressed:bg-selection aria-pressed:text-base-content [&_svg]:shrink-0",
        pressable,
        focusRing,
        iconSizeClasses[size],
        embedded
          ? "text-text-muted hover:text-base-content"
          : variantClasses[variant],
        shape === "circle" ? "rounded-full" : "rounded-lg",
        className,
      )}
      {...props}
    />
  );
}
