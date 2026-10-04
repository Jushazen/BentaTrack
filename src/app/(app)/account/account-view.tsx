// The "My account" page (owner only; amendment H2, FR-060; leaf 8.1), drawn by the server page
// online and by the offline app (leaf 9.2).
import { ChangePasswordForm } from "@/features/account/change-password-form";

export function AccountView({
  user,
  passwordMinLength,
}: {
  user: { name: string; email: string };
  passwordMinLength: number;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-text">My account</h1>
        <p className="text-muted mt-1">
          Logged in as {user.name} ({user.email}).
        </p>
      </div>
      <ChangePasswordForm passwordMinLength={passwordMinLength} />
    </div>
  );
}
