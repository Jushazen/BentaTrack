"use client";

// Labelled text input. The label is always visible (never placeholder-only), and the hint and
// error are tied to the input with aria-describedby so screen readers announce them.
import { useId, type InputHTMLAttributes } from "react";

export const inputClasses =
  "border-border bg-bg text-text w-full rounded-lg border px-3 py-2.5 text-base aria-invalid:border-danger";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> & {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
};

export function TextField({ label, hint, errors, className = "", ...rest }: TextFieldProps) {
  const id = useId();
  const hasError = Boolean(errors?.length);
  const describedBy =
    [hint ? `${id}-hint` : "", hasError ? `${id}-error` : ""].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="text-text block text-sm font-medium">
        {label}
        {!rest.required && <span className="text-muted font-normal"> (optional)</span>}
      </label>
      <input
        id={id}
        {...rest}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        className={inputClasses}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-muted text-[13px]">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={`${id}-error`} className="text-danger text-[13px]">
          {errors?.join(" ")}
        </p>
      )}
    </div>
  );
}
