"use client";

// FR-045: every account, with reset-password and deactivate/reactivate for staff accounts.
import { KeyRound, Save, UserCheck, UserX, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TextField } from "@/components/ui/field";
import { useResultAction } from "@/components/ui/use-result-action";
import { resetUserPassword, setUserActive } from "./actions";
import type { UserRow } from "./queries";

function ResetPasswordForm({
  user,
  passwordMinLength,
  onDone,
}: {
  user: UserRow;
  passwordMinLength: number;
  onDone: () => void;
}) {
  const { pending, fieldErrors, run } = useResultAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    run(() => resetUserPassword({ userId: user.id, password }), {
      success: `New password saved for ${user.name}.`,
      onSuccess: onDone,
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-wrap items-start gap-3">
      <TextField
        label={`New password for ${user.name}`}
        name="password"
        type="password"
        required
        autoComplete="new-password"
        hint={`At least ${passwordMinLength} characters. Tell ${user.name} the new password.`}
        errors={fieldErrors.password}
        className="w-full sm:max-w-sm"
      />
      <div className="flex gap-2 sm:mt-7">
        <Button type="submit" icon={Save} disabled={pending}>
          {pending ? "Saving…" : "Save password"}
        </Button>
        <Button variant="ghost" icon={X} onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function UserItem({ user, passwordMinLength }: { user: UserRow; passwordMinLength: number }) {
  const [resetting, setResetting] = useState(false);
  const { pending, run } = useResultAction();
  const isStaff = user.role === "STAFF";

  function toggleActive() {
    const active = !user.active;
    run(() => setUserActive({ userId: user.id, active }), {
      success: active ? `${user.name} can log in again.` : `${user.name} can no longer log in.`,
    });
  }

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-text flex flex-wrap items-center gap-2 font-medium">
            <span>{user.name}</span>
            <Badge>{isStaff ? "Staff" : "Owner"}</Badge>
            {user.active ? (
              <Badge tone="ok">Active</Badge>
            ) : (
              <Badge tone="danger">Deactivated</Badge>
            )}
          </p>
          <p className="text-muted mt-0.5 text-sm break-all">{user.email}</p>
        </div>
        {isStaff && !resetting && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={KeyRound} onClick={() => setResetting(true)}>
              Reset password
            </Button>
            {user.active ? (
              <ConfirmButton
                icon={UserX}
                label="Deactivate"
                question={`Deactivate ${user.name}? They won't be able to log in. Their past sales stay.`}
                confirmLabel="Yes, deactivate"
                onConfirm={toggleActive}
                pending={pending}
              />
            ) : (
              <Button
                variant="secondary"
                icon={UserCheck}
                onClick={toggleActive}
                disabled={pending}
              >
                Reactivate
              </Button>
            )}
          </div>
        )}
      </div>
      {resetting && (
        <ResetPasswordForm
          user={user}
          passwordMinLength={passwordMinLength}
          onDone={() => setResetting(false)}
        />
      )}
    </li>
  );
}

export function UserList({
  users,
  passwordMinLength,
}: {
  users: UserRow[];
  passwordMinLength: number;
}) {
  return (
    <section aria-labelledby="accounts-title" className="bg-surface rounded-lg p-4 lg:p-6">
      <h2 id="accounts-title" className="text-text text-lg font-semibold">
        Accounts
      </h2>
      <ul className="divide-border mt-4 divide-y" aria-label="Accounts">
        {users.map((user) => (
          <UserItem key={user.id} user={user} passwordMinLength={passwordMinLength} />
        ))}
      </ul>
    </section>
  );
}
