"use client";

// FR-060: the owner changes their own password, then is signed out here and everywhere else.
// Needs a connection; it is never saved on the device to sync later (leaf 9.5).
import { KeyRound } from "lucide-react";
import { signOut } from "next-auth/react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useResultAction } from "@/components/ui/use-result-action";
import { onlineOnly, PASSWORD_NEEDS_CONNECTION } from "@/features/users/online-only";
import { changeOwnPassword } from "./actions";

export function ChangePasswordForm({ passwordMinLength }: { passwordMinLength: number }) {
  const { pending, fieldErrors, run } = useResultAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run(
      () =>
        onlineOnly(
          () =>
            changeOwnPassword({
              currentPassword: String(data.get("currentPassword") ?? ""),
              newPassword: String(data.get("newPassword") ?? ""),
              confirmPassword: String(data.get("confirmPassword") ?? ""),
            }),
          PASSWORD_NEEDS_CONNECTION,
        ),
      {
        success: "Password changed. Log in again with your new password.",
        onSuccess: () => void signOut({ callbackUrl: "/login?signedOut=password" }),
      },
    );
  }

  return (
    <section aria-labelledby="change-password-title" className="bg-surface rounded-lg p-4 lg:p-6">
      <h2 id="change-password-title" className="text-text text-lg font-semibold">
        Change password
      </h2>
      <p className="text-muted mt-1 text-sm">
        You&apos;ll be logged out on every device, including this one, and log in again with the new
        password.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-5 grid max-w-md gap-4">
        <TextField
          label="Current password"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          errors={fieldErrors.currentPassword}
        />
        <TextField
          label="New password"
          name="newPassword"
          type="password"
          required
          autoComplete="new-password"
          hint={`At least ${passwordMinLength} characters.`}
          errors={fieldErrors.newPassword}
        />
        <TextField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          errors={fieldErrors.confirmPassword}
        />
        <div>
          <Button type="submit" icon={KeyRound} disabled={pending}>
            {pending ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </section>
  );
}
