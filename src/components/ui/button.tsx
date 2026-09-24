// Shared button styles. Every button shows a text label; the icon is optional and decorative
// (SRS §2.5: never icon-only).
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:brightness-110",
  secondary: "bg-secondary text-text hover:brightness-95 dark:hover:brightness-110",
  ghost: "text-text hover:bg-secondary",
  danger: "border border-danger text-danger hover:bg-secondary",
};

export function buttonClasses(variant: ButtonVariant = "primary", extra = "") {
  return [
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-medium",
    "transition-[filter,background-color] duration-100 ease-out",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    extra,
  ].join(" ");
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  icon: Icon,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type="button" {...rest} className={buttonClasses(variant, className)}>
      {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
      <span>{children}</span>
    </button>
  );
}
