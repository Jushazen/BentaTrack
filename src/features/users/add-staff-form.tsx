"use client";

// FR-045: owner adds a staff account.
import { UserPlus } from "lucide-react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useResultAction } from "@/components/ui/use-result-action";
import { createStaffUser } from "./actions";

export function AddStaffForm({ passwordMinLength }: { passwordMinLength: number }) {
  const { pending, fieldErrors, run } = useResultAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    run(
      () =>
        createStaffUser({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        }),
      { success: (user) => `Account created for ${user.name}.`, onSuccess: () => form.reset() },
    );
  }

  return (
    <section aria-labelledby="add-staff-title" className="bg-surface rounded-lg p-4 lg:p-6">
      <h2 id="add-staff-title" className="text-text text-lg font-semibold">
        Add staff account
      </h2>
      <p className="text-muted mt-1 text-sm">
        Staff can record sales, refunds and restocks, and add or edit products.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-5 grid gap-4 md:grid-cols-3">
        <TextField label="Name" name="name" required autoComplete="off" errors={fieldErrors.name} />
        <TextField
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="off"
          errors={fieldErrors.email}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          hint={`At least ${passwordMinLength} characters.`}
          errors={fieldErrors.password}
        />
        <div className="md:col-span-3">
          <Button type="submit" icon={UserPlus} disabled={pending}>
            {pending ? "Adding…" : "Add staff account"}
          </Button>
        </div>
      </form>
    </section>
  );
}
