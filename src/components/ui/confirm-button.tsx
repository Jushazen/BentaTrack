"use client";

// A button that asks before doing something destructive. The question and the confirm/cancel
// buttons appear in place (no browser confirm() dialog), each with a text label (SRS §2.5).
import { X, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button, type ButtonVariant } from "./button";

type ConfirmButtonProps = {
  icon?: LucideIcon;
  /** Label of the first button, e.g. "Delete". */
  label: string;
  /** Shown once clicked, e.g. "Delete Bags? This can't be undone." */
  question: string;
  /** Label of the button that actually does it, e.g. "Yes, delete". */
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  pending?: boolean;
  variant?: ButtonVariant;
};

export function ConfirmButton({
  icon,
  label,
  question,
  confirmLabel,
  onConfirm,
  pending = false,
  variant = "danger",
}: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button variant={variant} icon={icon} disabled={pending} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div role="group" aria-label={question} className="flex w-full flex-wrap items-center gap-2">
      <p className="text-text w-full text-sm">{question}</p>
      <Button
        variant={variant}
        icon={icon}
        disabled={pending}
        onClick={async () => {
          await onConfirm();
          setAsking(false);
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" icon={X} disabled={pending} onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </div>
  );
}
