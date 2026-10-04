// User accounts (owner only; SRS §3.1, FR-045). Leaf 2.3. The page itself is UsersView, which the
// offline app also draws (leaf 9.2).
import type { Metadata } from "next";
import { listUsers } from "@/features/users/queries";
import { UsersView } from "@/features/users/users-view";
import { PASSWORD_MIN_LENGTH, requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Users · BentaTrack" };

export default async function UsersPage() {
  await requirePageCapability("users.manage");
  return <UsersView users={await listUsers()} passwordMinLength={PASSWORD_MIN_LENGTH} />;
}
