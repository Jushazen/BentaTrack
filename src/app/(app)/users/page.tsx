// User accounts (owner only; SRS §3.1, FR-045). Leaf 2.3.
import type { Metadata } from "next";
import { AddStaffForm } from "@/features/users/add-staff-form";
import { listUsers } from "@/features/users/queries";
import { UserList } from "@/features/users/user-list";
import { PASSWORD_MIN_LENGTH, requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Users · BentaTrack" };

export default async function UsersPage() {
  await requirePageCapability("users.manage");
  const users = await listUsers();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-text">User accounts</h1>
        <p className="text-muted mt-1">
          Add staff, reset their passwords, or stop an account from logging in.
        </p>
      </div>
      <AddStaffForm passwordMinLength={PASSWORD_MIN_LENGTH} />
      {users.ok ? (
        <UserList users={users.data} passwordMinLength={PASSWORD_MIN_LENGTH} />
      ) : (
        <p role="alert" className="text-danger">
          {users.error.message}
        </p>
      )}
    </div>
  );
}
