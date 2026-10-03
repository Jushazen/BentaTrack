// My account (owner only; amendment H2, FR-060). Leaf 8.1.
import type { Metadata } from "next";
import { ChangePasswordForm } from "@/features/account/change-password-form";
import { PASSWORD_MIN_LENGTH, requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "My account · BentaTrack" };

export default async function AccountPage() {
  const user = await requirePageCapability("account.password");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-text">My account</h1>
        <p className="text-muted mt-1">
          Logged in as {user.name} ({user.email}).
        </p>
      </div>
      <ChangePasswordForm passwordMinLength={PASSWORD_MIN_LENGTH} />
    </div>
  );
}
