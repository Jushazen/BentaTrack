// The user accounts page (owner only; SRS §3.1, FR-045; leaf 2.3), drawn by the server page online
// and by the offline app from the device store (leaf 9.2).
import type { Result } from "@/lib/result";
import { AddStaffForm } from "./add-staff-form";
import type { UserRow } from "./queries";
import { UserList } from "./user-list";

export function UsersView({
  users,
  passwordMinLength,
}: {
  users: Result<UserRow[]>;
  passwordMinLength: number;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-text">User accounts</h1>
        <p className="text-muted mt-1">
          Add staff, reset their passwords, or stop an account from logging in.
        </p>
      </div>
      <AddStaffForm passwordMinLength={passwordMinLength} />
      {users.ok ? (
        <UserList users={users.data} passwordMinLength={passwordMinLength} />
      ) : (
        <p role="alert" className="text-danger">
          {users.error.message}
        </p>
      )}
    </div>
  );
}
